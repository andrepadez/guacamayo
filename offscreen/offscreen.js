let audioElement = null;
let currentBlobUrl = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'PLAY_AUDIO') {
    playAudio(message.audioData, message.speed)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.type === 'PAUSE_AUDIO') {
    if (audioElement) {
      audioElement.pause();
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'RESUME_AUDIO') {
    if (audioElement) {
      audioElement.play();
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'STOP_AUDIO') {
    stopAudio();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'SET_SPEED') {
    if (audioElement) {
      audioElement.playbackRate = message.speed;
    }
    sendResponse({ success: true });
    return true;
  }
});

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function playAudio(base64Data, speed) {
  stopAudio();

  const blob = base64ToBlob(base64Data, 'audio/mpeg');
  currentBlobUrl = URL.createObjectURL(blob);

  audioElement = new Audio(currentBlobUrl);
  audioElement.playbackRate = speed || 1;

  audioElement.onended = () => {
    // Clear reference to prevent stopAudio from triggering onerror
    const audio = audioElement;
    audioElement = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
    }
    cleanup();
    chrome.runtime.sendMessage({ type: 'AUDIO_ENDED_FROM_OFFSCREEN' });
  };

  audioElement.onerror = () => {
    const audio = audioElement;
    audioElement = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
    }
    cleanup();
    chrome.runtime.sendMessage({ type: 'AUDIO_ERROR_FROM_OFFSCREEN', error: 'Playback failed' });
  };

  // Resolve when audio starts playing, not when it ends
  await audioElement.play();
}

function stopAudio() {
  if (audioElement) {
    // Remove handlers first to prevent spurious events
    audioElement.onended = null;
    audioElement.onerror = null;
    audioElement.pause();
    audioElement.src = '';
    audioElement = null;
  }
  cleanup();
}

function cleanup() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}
