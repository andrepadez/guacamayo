let creatingOffscreen = null;
let currentTabId = null;

// Persist currentTabId across service worker restarts
async function setCurrentTabId(tabId) {
  currentTabId = tabId;
  await chrome.storage.session.set({ currentTabId: tabId });
}

async function getCurrentTabId() {
  if (currentTabId) return currentTabId;
  const result = await chrome.storage.session.get('currentTabId');
  currentTabId = result.currentTabId || null;
  return currentTabId;
}

// Rate limiting
const REQUEST_COOLDOWN_MS = 200;
let lastRequestTime = 0;
let pendingRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3;

// Initialize storage defaults
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['apiKey', 'voice', 'voiceEs', 'voicePt', 'speed'], (result) => {
    if (!result.voice) {
      chrome.storage.local.set({ voice: 'aura-2-thalia-en' });
    }
    if (!result.voiceEs) {
      chrome.storage.local.set({ voiceEs: 'aura-2-carina-es' });
    }
    if (!result.voicePt) {
      chrome.storage.local.set({ voicePt: 'pm_alex' });
    }
    if (!result.speed) {
      chrome.storage.local.set({ speed: 1 });
    }
  });
});

// Create context menus on startup (runs every time service worker starts)
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'guacamayo-read',
      title: 'Read with Guacamayo',
      contexts: ['page', 'selection', 'link']
    });

    chrome.contextMenus.create({
      id: 'guacamayo-read-image',
      title: 'Read image with Guacamayo',
      contexts: ['image']
    });

    console.log('[Guacamayo] Context menus created');
  });
}

createContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'guacamayo-read' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_READ' });
  }

  if (info.menuItemId === 'guacamayo-read-image' && tab?.id && info.srcUrl) {
    console.log('[Guacamayo] Image context menu clicked, sending to tab:', tab.id, info.srcUrl);
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_MENU_READ_IMAGE',
      imageUrl: info.srcUrl
    }).then(() => {
      console.log('[Guacamayo] Message sent successfully');
    }).catch(err => {
      console.error('[Guacamayo] Failed to send message:', err);
    });
  }
});

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing TTS audio from Deepgram API'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUDIO_ENDED_FROM_OFFSCREEN') {
    getCurrentTabId().then(tabId => {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'AUDIO_ENDED' }).catch(() => {});
      }
    });
    return;
  }

  if (message.type === 'AUDIO_ERROR_FROM_OFFSCREEN') {
    getCurrentTabId().then(tabId => {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'AUDIO_ERROR', error: message.error }).catch(() => {});
      }
    });
    return;
  }

  if (message.type === 'PLAY_AUDIO') {
    setCurrentTabId(sender.tab?.id);
    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'PLAY_AUDIO',
        audioData: message.audioData,
        speed: message.speed
      }))
      .then(response => sendResponse(response || { success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.type === 'PAUSE_AUDIO') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'PAUSE_AUDIO' })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.type === 'RESUME_AUDIO') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'RESUME_AUDIO' })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.type === 'STOP_AUDIO') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_AUDIO' })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.type === 'SET_SPEED') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'SET_SPEED', speed: message.speed })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: true }));
    return true;
  }
  
  if (message.type === 'SYNTHESIZE') {
    const synthesizer = message.provider === 'kokoro'
      ? synthesizeSpeechKokoro(message.text, message.apiKey, message.voice)
      : synthesizeSpeech(message.text, message.apiKey, message.voice);
    synthesizer
      .then(audioData => sendResponse({ success: true, audioData }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // OCR: Request text extraction from image using DeepInfra API
  if (message.type === 'OCR_IMAGE') {
    console.log('[Guacamayo] OCR_IMAGE received, model:', message.ocrModel);

    performOCR(message.imageData, message.ocrApiKey, message.ocrModel)
      .then(result => {
        console.log('[Guacamayo] OCR complete, success:', result.success);
        sendResponse(result);
      })
      .catch(err => {
        console.error('[Guacamayo] OCR error:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep channel open for async response
  }
});

async function synthesizeSpeech(text, apiKey, voice) {
  // Rate limiting check
  if (pendingRequests >= MAX_CONCURRENT_REQUESTS) {
    throw new Error('Too many pending requests. Please wait.');
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_COOLDOWN_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_COOLDOWN_MS - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  pendingRequests++;

  const url = new URL('https://api.deepgram.com/v1/speak');
  url.searchParams.set('model', voice);
  url.searchParams.set('encoding', 'mp3');

  // Set up timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusMessages = {
        400: 'Bad request - invalid text or parameters',
        401: 'Unauthorized - invalid API key',
        402: 'Payment required - API quota exceeded',
        403: 'Forbidden - API key lacks permission for this voice',
        429: 'Too many requests - rate limit exceeded',
        500: 'Deepgram server error',
        502: 'Deepgram service unavailable',
        503: 'Deepgram service temporarily unavailable'
      };
      const message = statusMessages[response.status] || `HTTP error ${response.status}`;
      throw new Error(`TTS failed: ${response.status} - ${message}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    return base64;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    pendingRequests--;
  }
}

async function synthesizeSpeechKokoro(text, apiKey, voice) {
  if (pendingRequests >= MAX_CONCURRENT_REQUESTS) {
    throw new Error('Too many pending requests. Please wait.');
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_COOLDOWN_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_COOLDOWN_MS - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  pendingRequests++;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        preset_voice: [voice],
        output_format: 'mp3'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusMessages = {
        400: 'Bad request - invalid text or parameters',
        401: 'Unauthorized - invalid DeepInfra API key',
        402: 'Payment required - DeepInfra quota exceeded',
        429: 'Too many requests - rate limit exceeded',
        500: 'DeepInfra server error'
      };
      const message = statusMessages[response.status] || `HTTP error ${response.status}`;
      throw new Error(`TTS failed: ${response.status} - ${message}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // If response is binary audio, convert to base64 like Deepgram
    if (contentType.startsWith('audio/')) {
      const arrayBuffer = await response.arrayBuffer();
      return arrayBufferToBase64(arrayBuffer);
    }

    const data = await response.json();
    if (!data.audio) {
      throw new Error('No audio data in response');
    }

    let audio = data.audio;
    // Strip data URL prefix if present
    if (audio.startsWith('data:')) {
      audio = audio.split(',')[1];
    }
    // Convert URL-safe base64 to standard base64
    audio = audio.replace(/-/g, '+').replace(/_/g, '/');
    // Fix padding
    while (audio.length % 4 !== 0) {
      audio += '=';
    }
    return audio;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    pendingRequests--;
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function performOCR(imageData, apiKey, model = 'deepseek-ai/DeepSeek-OCR') {
  if (!apiKey) {
    throw new Error('DeepInfra API key not configured. Add it in extension settings.');
  }

  console.log('[Guacamayo] Calling DeepInfra OCR API with model:', model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for OCR

  try {
    const response = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribe all text in this image exactly as it appears. Output only the transcribed text, nothing else. No descriptions, analysis, or commentary.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData // base64 data URL
                }
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusMessages = {
        401: 'Invalid DeepInfra API key',
        402: 'DeepInfra quota exceeded',
        429: 'Rate limit exceeded',
        500: 'DeepInfra server error'
      };
      throw new Error(statusMessages[response.status] || `OCR failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Guacamayo] DeepInfra response:', data);

    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return { success: false, error: 'No text extracted from image' };
    }

    return { success: true, text };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('OCR request timed out');
    }
    throw error;
  }
}
