const apiKeyInput = document.getElementById('apiKey');
const toggleKeyBtn = document.getElementById('toggleKey');
const ocrApiKeyInput = document.getElementById('ocrApiKey');
const toggleOcrKeyBtn = document.getElementById('toggleOcrKey');
const ocrModelSelect = document.getElementById('ocrModel');
const voiceSelect = document.getElementById('voice');
const voiceEsSelect = document.getElementById('voiceEs');
const voicePtSelect = document.getElementById('voicePt');
const speedInput = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

// Sections that depend on API keys
const deepgramSections = ['section-voice', 'section-voiceEs'];
const deepinfraSections = ['section-voicePt', 'section-ocrModel'];

function updateVisibility(apiKey, ocrApiKey) {
  const hasDeepgram = !!apiKey;
  const hasDeepinfra = !!ocrApiKey;

  deepgramSections.forEach(id => {
    document.getElementById(id).style.display = hasDeepgram ? '' : 'none';
  });
  deepinfraSections.forEach(id => {
    document.getElementById(id).style.display = hasDeepinfra ? '' : 'none';
  });
  // Speed only when at least one key is set
  document.getElementById('section-speed').style.display =
    (hasDeepgram || hasDeepinfra) ? '' : 'none';
}

chrome.storage.local.get(['apiKey', 'ocrApiKey', 'ocrModel', 'voice', 'voiceEs', 'voicePt', 'speed'], (result) => {
  if (result.apiKey) apiKeyInput.value = result.apiKey;
  if (result.ocrApiKey) ocrApiKeyInput.value = result.ocrApiKey;
  if (result.ocrModel) ocrModelSelect.value = result.ocrModel;
  if (result.voice) voiceSelect.value = result.voice;
  if (result.voiceEs) voiceEsSelect.value = result.voiceEs;
  if (result.voicePt) voicePtSelect.value = result.voicePt;
  if (result.speed) {
    speedInput.value = result.speed;
    speedValue.textContent = `${result.speed}x`;
  }

  updateVisibility(result.apiKey, result.ocrApiKey);
});

toggleKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

toggleOcrKeyBtn.addEventListener('click', () => {
  ocrApiKeyInput.type = ocrApiKeyInput.type === 'password' ? 'text' : 'password';
});

speedInput.addEventListener('input', () => {
  speedValue.textContent = `${speedInput.value}x`;
});

saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const ocrApiKey = ocrApiKeyInput.value.trim();
  const ocrModel = ocrModelSelect.value;
  const voice = voiceSelect.value;
  const voiceEs = voiceEsSelect.value;
  const voicePt = voicePtSelect.value;
  const speed = parseFloat(speedInput.value);

  if (!apiKey && !ocrApiKey) {
    showStatus('Please enter at least one API key', 'error');
    return;
  }

  showStatus('Validating...', '');

  try {
    // Validate Deepgram key if provided
    if (apiKey) {
      const response = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: 'Test' })
      });

      if (!response.ok) {
        const errorMessages = {
          401: 'Invalid Deepgram API key.',
          402: 'Deepgram quota exceeded.',
          403: 'API key lacks permission for this voice.',
          429: 'Rate limit exceeded.',
        };
        throw new Error(errorMessages[response.status] || `Deepgram validation failed (${response.status})`);
      }
    }

    chrome.storage.local.set({ apiKey, ocrApiKey, ocrModel, voice, voiceEs, voicePt, speed }, () => {
      showStatus('Settings saved!', 'success');
      updateVisibility(apiKey, ocrApiKey);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SETTINGS_UPDATED',
            settings: { apiKey, ocrApiKey, ocrModel, voice, voiceEs, voicePt, speed }
          }).catch(() => {});
        }
      });
    });
  } catch (error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      showStatus('Network error. Check your connection.', 'error');
    } else {
      showStatus(error.message, 'error');
    }
  }
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
}
