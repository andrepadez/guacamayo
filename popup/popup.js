const apiKeyInput = document.getElementById('apiKey');
const toggleKeyBtn = document.getElementById('toggleKey');
const voiceSelect = document.getElementById('voice');
const speedInput = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

chrome.storage.local.get(['apiKey', 'voice', 'speed'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
  }
  if (result.voice) {
    voiceSelect.value = result.voice;
  }
  if (result.speed) {
    speedInput.value = result.speed;
    speedValue.textContent = `${result.speed}x`;
  }
});

toggleKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

speedInput.addEventListener('input', () => {
  speedValue.textContent = `${speedInput.value}x`;
});

saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const voice = voiceSelect.value;
  const speed = parseFloat(speedInput.value);

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  showStatus('Validating API key...', '');
  
  try {
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
        401: 'Invalid API key. Please check and try again.',
        402: 'API quota exceeded. Please check your Deepgram account.',
        403: 'API key lacks permission for this voice.',
        429: 'Rate limit exceeded. Please wait a moment.',
      };
      throw new Error(errorMessages[response.status] || `Validation failed (${response.status})`);
    }

    chrome.storage.local.set({ apiKey, voice, speed }, () => {
      showStatus('Settings saved!', 'success');

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SETTINGS_UPDATED',
            settings: { apiKey, voice, speed }
          }).catch(() => {
            // Content script not loaded on this page - that's okay
          });
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
