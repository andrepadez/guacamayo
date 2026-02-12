// Voice data per provider
const DEEPGRAM_VOICES = {
  en: [
    { group: 'Featured', value: 'aura-2-thalia-en', label: 'Thalia (feminine, energetic)' },
    { group: 'Featured', value: 'aura-2-andromeda-en', label: 'Andromeda (feminine, expressive)' },
    { group: 'Featured', value: 'aura-2-helena-en', label: 'Helena (feminine, friendly)' },
    { group: 'Featured', value: 'aura-2-apollo-en', label: 'Apollo (masculine, confident)' },
    { group: 'Featured', value: 'aura-2-arcas-en', label: 'Arcas (masculine, smooth)' },
    { group: 'Featured', value: 'aura-2-aries-en', label: 'Aries (masculine, warm)' },
    { group: 'More Voices', value: 'aura-2-asteria-en', label: 'Asteria (feminine, confident)' },
    { group: 'More Voices', value: 'aura-2-athena-en', label: 'Athena (feminine, calm)' },
    { group: 'More Voices', value: 'aura-2-aurora-en', label: 'Aurora (feminine, cheerful)' },
    { group: 'More Voices', value: 'aura-2-cora-en', label: 'Cora (feminine, melodic)' },
    { group: 'More Voices', value: 'aura-2-draco-en', label: 'Draco (masculine, British)' },
    { group: 'More Voices', value: 'aura-2-hermes-en', label: 'Hermes (masculine, engaging)' },
    { group: 'More Voices', value: 'aura-2-orion-en', label: 'Orion (masculine, calm)' },
    { group: 'More Voices', value: 'aura-2-orpheus-en', label: 'Orpheus (masculine, trustworthy)' },
    { group: 'More Voices', value: 'aura-2-zeus-en', label: 'Zeus (masculine, deep)' }
  ],
  es: [
    { group: 'Peninsular', value: 'aura-2-carina-es', label: 'Carina (feminine, codeswitching)' },
    { group: 'Peninsular', value: 'aura-2-diana-es', label: 'Diana (feminine, codeswitching)' },
    { group: 'Peninsular', value: 'aura-2-nestor-es', label: 'Nestor (masculine)' },
    { group: 'Peninsular', value: 'aura-2-alvaro-es', label: 'Alvaro (masculine)' },
    { group: 'Peninsular', value: 'aura-2-agustina-es', label: 'Agustina (feminine)' },
    { group: 'Peninsular', value: 'aura-2-silvia-es', label: 'Silvia (feminine)' },
    { group: 'Mexican', value: 'aura-2-javier-es', label: 'Javier (masculine, codeswitching)' },
    { group: 'Mexican', value: 'aura-2-sirio-es', label: 'Sirio (masculine)' },
    { group: 'Mexican', value: 'aura-2-estrella-es', label: 'Estrella (feminine)' },
    { group: 'Mexican', value: 'aura-2-luciano-es', label: 'Luciano (masculine)' },
    { group: 'Mexican', value: 'aura-2-olivia-es', label: 'Olivia (feminine)' },
    { group: 'Mexican', value: 'aura-2-valerio-es', label: 'Valerio (masculine)' },
    { group: 'Other', value: 'aura-2-celeste-es', label: 'Celeste (feminine, Colombian)' },
    { group: 'Other', value: 'aura-2-gloria-es', label: 'Gloria (feminine, Colombian)' },
    { group: 'Other', value: 'aura-2-antonia-es', label: 'Antonia (feminine, Argentine)' },
    { group: 'Other', value: 'aura-2-aquila-es', label: 'Aquila (feminine, Latin American, codeswitching)' },
    { group: 'Other', value: 'aura-2-selena-es', label: 'Selena (feminine, Latin American, codeswitching)' }
  ],
  pt: []
};

const KOKORO_VOICES = {
  en: [
    { group: 'American Female', value: 'af_heart', label: 'Heart' },
    { group: 'American Female', value: 'af_alloy', label: 'Alloy' },
    { group: 'American Female', value: 'af_aoede', label: 'Aoede' },
    { group: 'American Female', value: 'af_bella', label: 'Bella' },
    { group: 'American Female', value: 'af_jessica', label: 'Jessica' },
    { group: 'American Female', value: 'af_kore', label: 'Kore' },
    { group: 'American Female', value: 'af_nicole', label: 'Nicole' },
    { group: 'American Female', value: 'af_nova', label: 'Nova' },
    { group: 'American Female', value: 'af_river', label: 'River' },
    { group: 'American Female', value: 'af_sarah', label: 'Sarah' },
    { group: 'American Female', value: 'af_sky', label: 'Sky' },
    { group: 'American Male', value: 'am_adam', label: 'Adam' },
    { group: 'American Male', value: 'am_echo', label: 'Echo' },
    { group: 'American Male', value: 'am_eric', label: 'Eric' },
    { group: 'American Male', value: 'am_liam', label: 'Liam' },
    { group: 'American Male', value: 'am_michael', label: 'Michael' },
    { group: 'American Male', value: 'am_onyx', label: 'Onyx' },
    { group: 'British Female', value: 'bf_emma', label: 'Emma' },
    { group: 'British Female', value: 'bf_isabella', label: 'Isabella' },
    { group: 'British Male', value: 'bm_daniel', label: 'Daniel' },
    { group: 'British Male', value: 'bm_fable', label: 'Fable' },
    { group: 'British Male', value: 'bm_george', label: 'George' },
    { group: 'British Male', value: 'bm_lewis', label: 'Lewis' }
  ],
  es: [
    { group: 'Spanish Female', value: 'ef_dora', label: 'Dora' },
    { group: 'Spanish Male', value: 'em_alex', label: 'Alex' },
    { group: 'Spanish Male', value: 'em_santa', label: 'Santa' }
  ],
  pt: [
    { group: 'Brazilian Female', value: 'pf_dora', label: 'Dora' },
    { group: 'Brazilian Male', value: 'pm_alex', label: 'Alex' },
    { group: 'Brazilian Male', value: 'pm_santa', label: 'Santa' }
  ]
};

const voiceSelect = document.getElementById('voice');
const voiceEsSelect = document.getElementById('voiceEs');
const voicePtSelect = document.getElementById('voicePt');
const speedInput = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');
const noConfigBanner = document.getElementById('noConfigBanner');

function populateVoiceDropdown(select, voices, currentValue) {
  select.innerHTML = '';
  const groups = {};

  for (const v of voices) {
    if (!groups[v.group]) groups[v.group] = [];
    groups[v.group].push(v);
  }

  for (const [groupName, items] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupName;
    for (const item of items) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }

  // Set current value or fall back to first
  if (currentValue && voices.some(v => v.value === currentValue)) {
    select.value = currentValue;
  } else if (voices.length > 0) {
    select.value = voices[0].value;
  }
}

function updateVoicesForProvider(provider, savedVoices = {}) {
  const voiceData = (provider === 'deepgram') ? DEEPGRAM_VOICES : KOKORO_VOICES;

  populateVoiceDropdown(voiceSelect, voiceData.en, savedVoices.voice);
  populateVoiceDropdown(voiceEsSelect, voiceData.es, savedVoices.voiceEs);

  // PT section: hide for Deepgram (no PT support)
  const ptSection = document.getElementById('section-voicePt');
  if (voiceData.pt.length === 0) {
    ptSection.style.display = 'none';
  } else {
    ptSection.style.display = '';
    populateVoiceDropdown(voicePtSelect, voiceData.pt, savedVoices.voicePt);
  }
}

// Load settings
chrome.storage.local.get(
  ['ttsProvider', 'ttsApiKey', 'voice', 'voiceEs', 'voicePt', 'speed'],
  (result) => {
    const provider = result.ttsProvider || 'openai';

    updateVoicesForProvider(provider, {
      voice: result.voice,
      voiceEs: result.voiceEs,
      voicePt: result.voicePt
    });

    if (result.speed) {
      speedInput.value = result.speed;
      speedValue.textContent = `${result.speed}x`;
    }

    // Show banner if no API key and not openai provider
    if (!result.ttsApiKey && provider !== 'openai') {
      noConfigBanner.style.display = '';
    }
  }
);

speedInput.addEventListener('input', () => {
  speedValue.textContent = `${speedInput.value}x`;
});

saveBtn.addEventListener('click', () => {
  const voice = voiceSelect.value;
  const voiceEs = voiceEsSelect.value;
  const voicePt = voicePtSelect.value;
  const speed = parseFloat(speedInput.value);

  chrome.storage.local.set({ voice, voiceEs, voicePt, speed }, () => {
    showStatus('Settings saved!', 'success');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SETTINGS_UPDATED',
          settings: { voice, voiceEs, voicePt, speed }
        }).catch(() => {});
      }
    });
  });
});

// Options page links
function openOptions(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

document.getElementById('openOptions').addEventListener('click', openOptions);
document.getElementById('openOptionsFromBanner').addEventListener('click', openOptions);

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
}
