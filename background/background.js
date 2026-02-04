let creatingOffscreen = null;
let currentTabId = null;

// Rate limiting
const REQUEST_COOLDOWN_MS = 200;
let lastRequestTime = 0;
let pendingRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['apiKey', 'voice', 'speed'], (result) => {
    if (!result.voice) {
      chrome.storage.local.set({ voice: 'aura-2-thalia-en' });
    }
    if (!result.speed) {
      chrome.storage.local.set({ speed: 1 });
    }
  });

  chrome.contextMenus.create({
    id: 'guacamayo-read',
    title: 'Read with Guacamayo',
    contexts: ['page', 'selection', 'link', 'image']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'guacamayo-read' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_READ' });
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
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, { type: 'AUDIO_ENDED' }).catch(() => {});
    }
    return;
  }
  
  if (message.type === 'AUDIO_ERROR_FROM_OFFSCREEN') {
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, { type: 'AUDIO_ERROR', error: message.error }).catch(() => {});
    }
    return;
  }
  
  if (message.type === 'PLAY_AUDIO') {
    currentTabId = sender.tab?.id;
    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'PLAY_AUDIO',
        audioData: message.audioData,
        speed: message.speed
      }))
      .then(() => sendResponse({ success: true }))
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
    synthesizeSpeech(message.text, message.apiKey, message.voice)
      .then(audioData => sendResponse({ success: true, audioData }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
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

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
