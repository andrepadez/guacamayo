const PROVIDER_DEFAULTS = {
  deepgram: { baseUrl: 'https://api.deepgram.com', model: '' },
  kokoro:   { baseUrl: 'https://api.deepinfra.com', model: 'hexgrad/Kokoro-82M' },
  openai:   { baseUrl: 'http://macmini:9002', model: 'mlx-community/Kokoro-82M-bf16' }
};

const ttsProviderSelect = document.getElementById('ttsProvider');
const ttsBaseUrlInput = document.getElementById('ttsBaseUrl');
const ttsApiKeyInput = document.getElementById('ttsApiKey');
const toggleTtsKeyBtn = document.getElementById('toggleTtsKey');
const ttsModelInput = document.getElementById('ttsModel');
const ttsModelField = document.getElementById('ttsModelField');
const ocrBaseUrlInput = document.getElementById('ocrBaseUrl');
const ocrApiKeyInput = document.getElementById('ocrApiKey');
const toggleOcrKeyBtn = document.getElementById('toggleOcrKey');
const ocrModelSelect = document.getElementById('ocrModel');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

function updateProviderUI(provider) {
  const defaults = PROVIDER_DEFAULTS[provider];
  ttsBaseUrlInput.placeholder = defaults.baseUrl;
  ttsModelInput.placeholder = defaults.model || '(voice is the model)';
  ttsModelField.style.display = provider === 'deepgram' ? 'none' : '';
}

// Load saved settings
chrome.storage.local.get(
  ['ttsProvider', 'ttsBaseUrl', 'ttsApiKey', 'ttsModel',
   'ocrBaseUrl', 'ocrApiKey', 'ocrModel'],
  (result) => {
    if (result.ttsProvider) ttsProviderSelect.value = result.ttsProvider;
    if (result.ttsBaseUrl) ttsBaseUrlInput.value = result.ttsBaseUrl;
    if (result.ttsApiKey) ttsApiKeyInput.value = result.ttsApiKey;
    if (result.ttsModel) ttsModelInput.value = result.ttsModel;
    if (result.ocrBaseUrl) ocrBaseUrlInput.value = result.ocrBaseUrl;
    if (result.ocrApiKey) ocrApiKeyInput.value = result.ocrApiKey;
    if (result.ocrModel) ocrModelSelect.value = result.ocrModel;

    updateProviderUI(ttsProviderSelect.value);
  }
);

ttsProviderSelect.addEventListener('change', () => {
  const provider = ttsProviderSelect.value;
  const defaults = PROVIDER_DEFAULTS[provider];

  // Auto-fill base URL and model if currently empty or matching a different provider's default
  const currentBase = ttsBaseUrlInput.value.trim();
  const isDefaultBase = !currentBase || Object.values(PROVIDER_DEFAULTS).some(d => d.baseUrl === currentBase);
  if (isDefaultBase) ttsBaseUrlInput.value = defaults.baseUrl;

  const currentModel = ttsModelInput.value.trim();
  const isDefaultModel = !currentModel || Object.values(PROVIDER_DEFAULTS).some(d => d.model === currentModel);
  if (isDefaultModel) ttsModelInput.value = defaults.model;

  updateProviderUI(provider);
});

toggleTtsKeyBtn.addEventListener('click', () => {
  ttsApiKeyInput.type = ttsApiKeyInput.type === 'password' ? 'text' : 'password';
});

toggleOcrKeyBtn.addEventListener('click', () => {
  ocrApiKeyInput.type = ocrApiKeyInput.type === 'password' ? 'text' : 'password';
});

saveBtn.addEventListener('click', () => {
  const ttsProvider = ttsProviderSelect.value;
  const defaults = PROVIDER_DEFAULTS[ttsProvider];
  const ttsBaseUrl = (ttsBaseUrlInput.value.trim() || defaults.baseUrl).replace(/\/+$/, '');
  const ttsApiKey = ttsApiKeyInput.value.trim();
  const ttsModel = (ttsModelInput.value.trim() || defaults.model);
  const ocrBaseUrl = (ocrBaseUrlInput.value.trim() || 'http://macmini:1234/v1').replace(/\/+$/, '');
  const ocrApiKey = ocrApiKeyInput.value.trim();
  const ocrModel = ocrModelSelect.value;

  const data = { ttsProvider, ttsBaseUrl, ttsApiKey, ttsModel, ocrBaseUrl, ocrApiKey, ocrModel };

  chrome.storage.local.set(data, () => {
    showStatus('Settings saved!', 'success');

    // Broadcast to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SETTINGS_UPDATED',
          settings: data
        }).catch(() => {});
      }
    });
  });
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
}
