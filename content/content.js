const EXCLUDED_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'input', 'textarea', 'select', 'noscript', 'iframe'];

// Toast notification system
let activeToast = null;

function showToast(message, type = 'info', duration = 5000) {
  // Remove existing toast
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  const icons = {
    error: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-8h2v8z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `guacamayo-toast ${type}`;
  toast.innerHTML = `
    <div class="guacamayo-toast-icon">${icons[type]}</div>
    <div class="guacamayo-toast-message">${message}</div>
    <button class="guacamayo-toast-close">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  `;

  document.body.appendChild(toast);
  activeToast = toast;

  // Close button handler
  toast.querySelector('.guacamayo-toast-close').addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
      if (activeToast === toast) activeToast = null;
    }, 300);
  });

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove('visible');
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
          if (activeToast === toast) activeToast = null;
        }, 300);
      }
    }, duration);
  }
}

function parseApiError(error) {
  const message = error.message || error.toString();

  if (message.includes('401') || message.includes('Unauthorized')) {
    return 'Invalid API key. Please check your Deepgram API key in the extension settings.';
  }
  if (message.includes('402') || message.includes('Payment')) {
    return 'Deepgram API quota exceeded. Please check your account balance.';
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (message.includes('403') || message.includes('Forbidden')) {
    return 'Access denied. Your API key may not have permission for this voice.';
  }
  if (message.includes('API key not configured')) {
    return 'No API key configured. Click the Guacamayo extension icon to add your Deepgram API key.';
  }
  if (message.includes('NetworkError') || message.includes('Failed to fetch')) {
    return 'Network error. Please check your internet connection.';
  }
  if (message.includes('TTS failed: 5')) {
    return 'Deepgram service temporarily unavailable. Please try again later.';
  }

  return `Playback error: ${message}`;
}

let isPlaying = false;
let isPaused = false;
let settings = { apiKey: '', ocrApiKey: '', ocrModel: 'deepseek-ai/DeepSeek-OCR', voice: 'aura-2-thalia-en', speed: 1 };
let textChunks = [];
let currentChunkIndex = 0;
let audioCache = new Map();
let highlightOverlay = null;
let clickHandler = null;

// New: context menu selection state
let lastRightClickedElement = null;
let selectedContainer = null;
let inlineControlsEl = null;

// OCR state
let ocrOverlayEl = null;
let extractedOcrText = null;

// Container hierarchy for scroll/keyboard navigation
let containerHierarchy = [];
let currentHierarchyIndex = 0;
let wheelHandler = null;
let keyHandler = null;

// Track right-clicked element for context menu
document.addEventListener('contextmenu', (e) => {
  lastRightClickedElement = e.target;
});

function extractReadableText(element) {
  if (!element) return '';

  const clone = element.cloneNode(true);

  EXCLUDED_TAGS.forEach(tag => {
    clone.querySelectorAll(tag).forEach(el => el.remove());
  });

  const text = clone.textContent || '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function findReadableContainer(element) {
  let current = element;
  while (current && current !== document.body) {
    const text = extractReadableText(current);
    if (text.length > 100) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function buildContainerHierarchy(element) {
  const hierarchy = [];
  let current = element;

  while (current && current !== document.body) {
    const text = extractReadableText(current);
    // Only include elements with meaningful text content
    if (text.length > 50) {
      hierarchy.push(current);
    }
    current = current.parentElement;
  }

  return hierarchy;
}

function handleWheelNavigation(e) {
  if (!selectedContainer || isPlaying) return;

  // Only handle when hovering over the selected container or controls
  const isOverContainer = selectedContainer.contains(e.target) ||
                          e.target.closest('.guacamayo-inline-controls');
  if (!isOverContainer) return;

  e.preventDefault();

  if (e.deltaY < 0) {
    // Scroll up = expand to parent
    navigateHierarchy(1);
  } else if (e.deltaY > 0) {
    // Scroll down = shrink to child
    navigateHierarchy(-1);
  }
}

function navigateHierarchy(direction) {
  const newIndex = currentHierarchyIndex + direction;

  if (newIndex < 0 || newIndex >= containerHierarchy.length) return;

  currentHierarchyIndex = newIndex;
  const newContainer = containerHierarchy[currentHierarchyIndex];

  // Update selection without clearing hierarchy
  if (selectedContainer) {
    selectedContainer.classList.remove('guacamayo-selected');
  }

  selectedContainer = newContainer;
  selectedContainer.classList.add('guacamayo-selected');
  positionInlineControls();
}

function handleKeyNavigation(e) {
  if (!selectedContainer) return;

  // Escape: dismiss selection or stop playback
  if (e.key === 'Escape') {
    e.stopImmediatePropagation();
    e.preventDefault();
    clearSelection();
    return;
  }

  // Space: play/pause toggle
  if (e.key === ' ' && !e.target.closest('input, textarea, [contenteditable]')) {
    e.preventDefault();
    togglePlayback();
    return;
  }

  // During playback: Left/Right to skip chunks
  if (isPlaying && !isPaused) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentChunkIndex > 0) {
        jumpToChunk(currentChunkIndex - 1);
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentChunkIndex < textChunks.length - 1) {
        jumpToChunk(currentChunkIndex + 1);
      }
      return;
    }
  }

  // When not playing: Up/Down to navigate hierarchy
  if (!isPlaying) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHierarchy(1); // Expand to parent
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHierarchy(-1); // Shrink to child
    }
  }
}

function chunkText(text, maxLength = 1000) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((currentChunk + ' ' + trimmedSentence).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }

      if (trimmedSentence.length > maxLength) {
        const words = trimmedSentence.split(' ');
        currentChunk = '';
        for (const word of words) {
          if ((currentChunk + ' ' + word).length > maxLength) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
      } else {
        currentChunk = trimmedSentence;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

function getTextNodesWithPositions(element) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (EXCLUDED_TAGS.includes(tag)) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  let node;
  let pos = 0;

  while (node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ');
    nodes.push({ node, start: pos, end: pos + text.length, text });
    pos += text.length;
  }

  return nodes;
}

function findChunkRects(chunkText, contentElement) {
  const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim().toLowerCase();
  const textNodes = getTextNodesWithPositions(contentElement);

  let fullText = '';
  for (const n of textNodes) {
    fullText += n.text;
  }
  fullText = fullText.toLowerCase();

  const searchTerms = [
    normalizedChunk,
    normalizedChunk.split(' ').slice(0, 8).join(' '),
    normalizedChunk.split(' ').slice(0, 5).join(' ')
  ];

  let matchStart = -1;
  for (const term of searchTerms) {
    matchStart = fullText.indexOf(term);
    if (matchStart !== -1) break;
  }

  if (matchStart === -1) return [];

  const matchEnd = matchStart + normalizedChunk.length;
  const rects = [];

  for (const { node, start, end } of textNodes) {
    if (end <= matchStart || start >= matchEnd) continue;

    const rangeStart = Math.max(0, matchStart - start);
    const rangeEnd = Math.min(node.textContent.length, matchEnd - start);

    if (rangeStart < rangeEnd && rangeStart < node.textContent.length) {
      try {
        const range = document.createRange();
        range.setStart(node, rangeStart);
        range.setEnd(node, Math.min(rangeEnd, node.textContent.length));
        const rangeRects = range.getClientRects();
        for (const rect of rangeRects) {
          if (rect.width > 0 && rect.height > 0) {
            rects.push({
              top: rect.top + window.scrollY,
              left: rect.left + window.scrollX,
              width: rect.width,
              height: rect.height
            });
          }
        }
      } catch (e) {}
    }
  }

  return rects;
}

function createHighlightOverlay() {
  if (highlightOverlay) {
    highlightOverlay.remove();
  }

  highlightOverlay = document.createElement('div');
  highlightOverlay.className = 'guacamayo-overlay-container';
  document.body.appendChild(highlightOverlay);
}

function highlightChunk(chunkIndex) {
  // Skip highlighting for OCR text (no container to highlight in)
  if (extractedOcrText) return;

  if (!highlightOverlay) {
    createHighlightOverlay();
  }

  highlightOverlay.innerHTML = '';

  if (!selectedContainer || chunkIndex >= textChunks.length) return;

  const rects = findChunkRects(textChunks[chunkIndex], selectedContainer);

  for (const rect of rects) {
    const highlight = document.createElement('div');
    highlight.className = 'guacamayo-highlight-rect';
    highlight.style.cssText = `
      position: absolute;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
    `;
    highlightOverlay.appendChild(highlight);
  }

  if (rects.length > 0) {
    const firstRect = rects[0];
    const viewportHeight = window.innerHeight;
    const targetY = firstRect.top - (viewportHeight / 3);

    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: 'smooth'
    });
  }
}

function clearHighlights() {
  if (highlightOverlay) {
    highlightOverlay.innerHTML = '';
  }
}

function findChunkIndexForClick(clickedText) {
  const normalizedClick = clickedText.replace(/\s+/g, ' ').trim().toLowerCase();

  for (let i = 0; i < textChunks.length; i++) {
    const normalizedChunk = textChunks[i].replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalizedChunk.includes(normalizedClick) || normalizedClick.includes(normalizedChunk.slice(0, 50))) {
      return i;
    }
  }

  let bestMatch = -1;
  let bestScore = 0;

  const clickWords = normalizedClick.split(' ').slice(0, 10);

  for (let i = 0; i < textChunks.length; i++) {
    const chunkWords = textChunks[i].toLowerCase().split(' ');
    let score = 0;
    for (const word of clickWords) {
      if (word.length > 3 && chunkWords.includes(word)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = i;
    }
  }

  return bestMatch >= 0 && bestScore >= 2 ? bestMatch : -1;
}

function handleContentClick(e) {
  if (!isPlaying || e.target.closest('.guacamayo-inline-controls')) return;

  const targetEl = e.target.closest('p, span, div, [data-testid="tweetText"], article');
  let clickedText = '';

  if (targetEl) {
    clickedText = extractReadableText(targetEl);
  }

  if (!clickedText || clickedText.length < 10) return;

  const chunkIndex = findChunkIndexForClick(clickedText);

  if (chunkIndex >= 0 && chunkIndex !== currentChunkIndex) {
    jumpToChunk(chunkIndex);
  }
}

function jumpToChunk(index) {
  chrome.runtime.sendMessage({ type: 'STOP_AUDIO' });
  audioCache.clear();
  playChunk(index);
}

function setupClickHandler() {
  if (clickHandler) {
    document.removeEventListener('click', clickHandler);
  }
  clickHandler = handleContentClick;
  document.addEventListener('click', clickHandler);
}

function removeClickHandler() {
  if (clickHandler) {
    document.removeEventListener('click', clickHandler);
    clickHandler = null;
  }
}

async function synthesizeSpeech(text) {
  if (!settings.apiKey) {
    throw new Error('API key not configured. Click the extension icon to add your Deepgram API key.');
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'SYNTHESIZE',
      text,
      apiKey: settings.apiKey,
      voice: settings.voice
    }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.success) {
        resolve(response.audioData);
      } else {
        reject(new Error(response?.error || 'Synthesis failed'));
      }
    });
  });
}

async function prefetchChunks(startIndex, count = 2) {
  for (let i = startIndex; i < Math.min(startIndex + count, textChunks.length); i++) {
    if (audioCache.has(i) || !isPlaying) continue;

    try {
      const audioData = await synthesizeSpeech(textChunks[i]);
      if (isPlaying) {
        audioCache.set(i, audioData);
      }
    } catch (e) {
      console.error('Prefetch error:', e);
      break;
    }
  }
}

async function playChunk(index) {
  console.log('[Guacamayo] playChunk called, index:', index);

  if (index >= textChunks.length) {
    console.log('[Guacamayo] End of chunks, stopping');
    stopPlayback();
    return;
  }

  currentChunkIndex = index;
  highlightChunk(index);

  let audioData = audioCache.get(index);
  console.log('[Guacamayo] audioData from cache:', !!audioData);

  if (!audioData) {
    updateInlineControlsUI('loading');
    console.log('[Guacamayo] Calling synthesizeSpeech...');
    try {
      audioData = await synthesizeSpeech(textChunks[index]);
      console.log('[Guacamayo] synthesizeSpeech returned, audioData length:', audioData?.length);
    } catch (error) {
      console.error('[Guacamayo] Playback error:', error);
      showToast(parseApiError(error), 'error');
      stopPlayback();
      return;
    }
  }

  console.log('[Guacamayo] isPlaying:', isPlaying);
  if (!isPlaying) {
    console.log('[Guacamayo] isPlaying is false, aborting');
    return;
  }

  audioCache.delete(index);

  console.log('[Guacamayo] Sending PLAY_AUDIO, audioData length:', audioData?.length);
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'PLAY_AUDIO',
        audioData,
        speed: settings.speed
      }, response => {
        console.log('[Guacamayo] PLAY_AUDIO response:', response);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Playback failed'));
        }
      });
    });

    console.log('[Guacamayo] PLAY_AUDIO successful, updating UI');
    updateInlineControlsUI('playing');
    prefetchChunks(index + 1, 2);
  } catch (error) {
    console.error('[Guacamayo] Play error:', error);
    showToast(parseApiError(error), 'error');
    stopPlayback();
  }
}

function selectContainer(container, hierarchy = null, hierarchyIndex = 0) {
  clearSelection();

  // Build or use provided hierarchy
  if (hierarchy) {
    containerHierarchy = hierarchy;
    currentHierarchyIndex = hierarchyIndex;
  } else {
    containerHierarchy = buildContainerHierarchy(container);
    currentHierarchyIndex = 0;
  }

  selectedContainer = container;
  container.classList.add('guacamayo-selected');

  inlineControlsEl = document.createElement('div');
  inlineControlsEl.className = 'guacamayo-inline-controls';

  const canNavigate = containerHierarchy.length > 1;
  const navHint = canNavigate
    ? `<div class="guacamayo-nav-hint">↑↓ resize · Space play · Esc close</div>`
    : `<div class="guacamayo-nav-hint">Space play · Esc close</div>`;

  inlineControlsEl.innerHTML = `
    <button class="guacamayo-inline-btn" title="Play selection">
      <svg class="guacamayo-icon-play" viewBox="0 0 24 24" width="20" height="20">
        <path fill="currentColor" d="M8 5v14l11-7z"/>
      </svg>
      <svg class="guacamayo-icon-pause" viewBox="0 0 24 24" width="20" height="20" style="display:none">
        <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
      <div class="guacamayo-spinner" style="display:none"></div>
    </button>
    <div class="guacamayo-progress" style="display:none">
      <span class="guacamayo-progress-text"></span>
    </div>
    ${navHint}
  `;

  document.body.appendChild(inlineControlsEl);
  positionInlineControls();

  inlineControlsEl.querySelector('.guacamayo-inline-btn').addEventListener('click', togglePlayback);

  // Set up wheel and keyboard navigation
  wheelHandler = handleWheelNavigation;
  keyHandler = handleKeyNavigation;
  document.addEventListener('wheel', wheelHandler, { passive: false });
  document.addEventListener('keydown', keyHandler, { capture: true });
}

function clearSelection() {
  if (selectedContainer) {
    selectedContainer.classList.remove('guacamayo-selected');
    selectedContainer = null;
  }
  if (inlineControlsEl) {
    inlineControlsEl.remove();
    inlineControlsEl = null;
  }
  if (wheelHandler) {
    document.removeEventListener('wheel', wheelHandler);
    wheelHandler = null;
  }
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler, { capture: true });
    keyHandler = null;
  }
  containerHierarchy = [];
  currentHierarchyIndex = 0;
  if (isPlaying || isPaused) {
    stopPlayback();
  }
}

function positionInlineControls() {
  // Controls are now fixed position via CSS, no JS positioning needed
}

function updateInlineControlsUI(state) {
  if (!inlineControlsEl) return;

  const playIcon = inlineControlsEl.querySelector('.guacamayo-icon-play');
  const pauseIcon = inlineControlsEl.querySelector('.guacamayo-icon-pause');
  const spinner = inlineControlsEl.querySelector('.guacamayo-spinner');
  const btn = inlineControlsEl.querySelector('.guacamayo-inline-btn');
  const progress = inlineControlsEl.querySelector('.guacamayo-progress');
  const progressText = inlineControlsEl.querySelector('.guacamayo-progress-text');

  switch (state) {
    case 'loading':
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'none';
      spinner.style.display = 'block';
      btn.classList.add('loading');
      btn.classList.remove('playing');
      if (progress) progress.style.display = 'flex';
      break;
    case 'playing':
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      spinner.style.display = 'none';
      btn.classList.remove('loading');
      btn.classList.add('playing');
      if (progress) progress.style.display = 'flex';
      break;
    case 'paused':
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      spinner.style.display = 'none';
      btn.classList.remove('loading', 'playing');
      if (progress) progress.style.display = 'flex';
      break;
    case 'idle':
    default:
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      spinner.style.display = 'none';
      btn.classList.remove('loading', 'playing');
      if (progress) progress.style.display = 'none';
      break;
  }

  // Update progress text
  if (progressText && textChunks.length > 0 && (state === 'playing' || state === 'loading' || state === 'paused')) {
    progressText.textContent = `${currentChunkIndex + 1}/${textChunks.length}`;
  }
}

function togglePlayback() {
  if (isPlaying && !isPaused) {
    pausePlayback();
  } else if (isPaused) {
    resumePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (!selectedContainer) return;

  const text = extractReadableText(selectedContainer);
  if (!text || text.length < 50) {
    showToast('Not enough readable text in this selection. Try selecting a larger area.', 'warning');
    return;
  }

  textChunks = chunkText(text);
  currentChunkIndex = 0;
  isPlaying = true;
  isPaused = false;
  audioCache.clear();

  createHighlightOverlay();
  setupClickHandler();
  playChunk(0);
}

function stopPlayback() {
  isPlaying = false;
  isPaused = false;

  chrome.runtime.sendMessage({ type: 'STOP_AUDIO' });
  audioCache.clear();
  clearHighlights();
  removeClickHandler();

  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }

  // Clean up OCR state
  extractedOcrText = null;

  currentChunkIndex = 0;
  updateInlineControlsUI('idle');
}

function pausePlayback() {
  if (isPlaying) {
    chrome.runtime.sendMessage({ type: 'PAUSE_AUDIO' });
    isPaused = true;
    updateInlineControlsUI('paused');
  }
}

function resumePlayback() {
  if (isPaused) {
    chrome.runtime.sendMessage({ type: 'RESUME_AUDIO' });
    isPaused = false;
    updateInlineControlsUI('playing');
  }
}

// Controls are now fixed position, no repositioning needed

// ============ OCR Functions ============

async function fetchImageAsBase64(url) {
  console.log('[Guacamayo] Fetching image:', url);
  try {
    const response = await fetch(url, { mode: 'cors' });
    console.log('[Guacamayo] Fetch response status:', response.status);
    const blob = await response.blob();
    console.log('[Guacamayo] Blob size:', blob.size);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('[Guacamayo] Base64 length:', reader.result?.length);
        resolve(reader.result);
      };
      reader.onerror = (e) => {
        console.error('[Guacamayo] FileReader error:', e);
        reject(e);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[Guacamayo] Image fetch error:', error);
    throw new Error(`Failed to load image: ${error.message}`);
  }
}

function showOcrOverlay(imageUrl) {
  console.log('[Guacamayo] Showing OCR overlay for:', imageUrl);
  removeOcrOverlay();

  ocrOverlayEl = document.createElement('div');
  ocrOverlayEl.className = 'guacamayo-ocr-overlay';
  ocrOverlayEl.innerHTML = `
    <div class="guacamayo-ocr-card">
      <div class="guacamayo-ocr-header">
        <span>Reading image...</span>
        <button class="guacamayo-ocr-close" title="Cancel">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="guacamayo-ocr-preview">
        <img src="${imageUrl}" alt="Image being processed">
      </div>
      <div class="guacamayo-ocr-languages">
        <div class="guacamayo-ocr-progress">
          <div class="guacamayo-ocr-progress-bar">
            <div class="guacamayo-ocr-progress-fill" style="width: 30%"></div>
          </div>
          <span class="guacamayo-ocr-progress-text">Extracting text...</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(ocrOverlayEl);

  ocrOverlayEl.querySelector('.guacamayo-ocr-close').addEventListener('click', () => {
    removeOcrOverlay();
  });
}

function updateOcrProgress(progress, text) {
  if (!ocrOverlayEl) return;

  const fill = ocrOverlayEl.querySelector('.guacamayo-ocr-progress-fill');
  const progressText = ocrOverlayEl.querySelector('.guacamayo-ocr-progress-text');

  if (fill) fill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = text || `Extracting text... ${progress}%`;
}

function showOcrError(error) {
  if (!ocrOverlayEl) return;

  const header = ocrOverlayEl.querySelector('.guacamayo-ocr-header span');
  if (header) header.textContent = 'Error';

  const langSection = ocrOverlayEl.querySelector('.guacamayo-ocr-languages');
  if (langSection) {
    langSection.innerHTML = `
      <div class="guacamayo-ocr-error">
        <span>${escapeHtml(error)}</span>
      </div>
    `;
  }
}

function showOcrResult(text) {
  if (!ocrOverlayEl) return;

  // Update header
  const header = ocrOverlayEl.querySelector('.guacamayo-ocr-header span');
  if (header) header.textContent = 'Text extracted';

  // Replace languages/progress section with result
  const langSection = ocrOverlayEl.querySelector('.guacamayo-ocr-languages');
  if (langSection) {
    langSection.innerHTML = `
      <div class="guacamayo-ocr-result">
        <div class="guacamayo-ocr-text">${escapeHtml(text.substring(0, 200))}${text.length > 200 ? '...' : ''}</div>
        <button class="guacamayo-ocr-play">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Play
        </button>
      </div>
    `;

    langSection.querySelector('.guacamayo-ocr-play').addEventListener('click', () => {
      removeOcrOverlay();
      playExtractedText(text);
    });
  }
}

function removeOcrOverlay() {
  if (ocrOverlayEl) {
    ocrOverlayEl.remove();
    ocrOverlayEl = null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function playExtractedText(text) {
  console.log('[Guacamayo] playExtractedText called, text length:', text.length);
  console.log('[Guacamayo] settings.apiKey exists:', !!settings.apiKey);

  // Check for API key
  if (!settings.apiKey) {
    showToast('Deepgram API key not configured. Click the extension icon to add it.', 'error');
    return;
  }

  // Clear any existing selection FIRST (before setting isPlaying)
  clearSelection();

  // Create a virtual container for the extracted text
  extractedOcrText = text;

  // Clean up text - remove excessive whitespace/newlines from OCR
  const cleanedText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  // Reuse existing playback infrastructure
  textChunks = chunkText(cleanedText);
  console.log('[Guacamayo] Chunked into', textChunks.length, 'chunks');

  currentChunkIndex = 0;
  isPlaying = true;
  isPaused = false;
  audioCache.clear();

  // Create UI for OCR playback
  showOcrPlaybackControls();
  console.log('[Guacamayo] Starting playChunk(0)');
  playChunk(0);
}

function showOcrPlaybackControls() {
  inlineControlsEl = document.createElement('div');
  inlineControlsEl.className = 'guacamayo-inline-controls';
  inlineControlsEl.innerHTML = `
    <button class="guacamayo-inline-btn" title="Pause">
      <svg class="guacamayo-icon-play" viewBox="0 0 24 24" width="20" height="20" style="display:none">
        <path fill="currentColor" d="M8 5v14l11-7z"/>
      </svg>
      <svg class="guacamayo-icon-pause" viewBox="0 0 24 24" width="20" height="20">
        <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
      <div class="guacamayo-spinner" style="display:none"></div>
    </button>
    <div class="guacamayo-progress" style="display:flex">
      <span class="guacamayo-progress-text">1/${textChunks.length}</span>
    </div>
    <div class="guacamayo-nav-hint">From image · ←→ skip · Esc stop</div>
  `;

  document.body.appendChild(inlineControlsEl);

  inlineControlsEl.querySelector('.guacamayo-inline-btn').addEventListener('click', togglePlayback);

  // Set up keyboard handler
  keyHandler = handleKeyNavigation;
  document.addEventListener('keydown', keyHandler, { capture: true });
}

async function handleImageOcr(imageUrl) {
  showOcrOverlay(imageUrl);

  try {
    updateOcrProgress(10, 'Loading image...');
    const imageData = await fetchImageAsBase64(imageUrl);

    updateOcrProgress(30, 'Extracting text...');

    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'OCR_IMAGE',
        imageData,
        ocrApiKey: settings.ocrApiKey,
        ocrModel: settings.ocrModel
      }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });

    if (result.success && result.text) {
      const trimmedText = result.text.trim();
      if (trimmedText.length < 10) {
        showOcrError('No readable text found in image.');
      } else {
        showOcrResult(trimmedText);
      }
    } else {
      showOcrError(result.error || 'Failed to extract text from image.');
    }
  } catch (error) {
    console.error('OCR error:', error);
    showOcrError(error.message);
  }
}

function init() {
  chrome.storage.local.get(['apiKey', 'ocrApiKey', 'ocrModel', 'voice', 'speed'], (result) => {
    settings = { ...settings, ...result };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTEXT_MENU_READ') {
    if (lastRightClickedElement) {
      // Check if we're clicking on something that shouldn't be read
      const tag = lastRightClickedElement.tagName.toLowerCase();
      const isInteractive = ['button', 'input', 'textarea', 'select', 'a'].includes(tag) ||
                           lastRightClickedElement.closest('button, input, textarea, select');

      if (isInteractive) {
        // Try to find a readable parent instead
        const parent = lastRightClickedElement.closest('article, section, main, div, p');
        if (parent) {
          lastRightClickedElement = parent;
        }
      }

      // Build hierarchy from the clicked element
      const hierarchy = buildContainerHierarchy(lastRightClickedElement);
      if (hierarchy.length > 0) {
        // Start with the smallest readable container (index 0)
        selectContainer(hierarchy[0], hierarchy, 0);
      } else {
        showToast('No readable content found here. Try clicking on a text area.', 'warning');
      }
    }
  }

  if (message.type === 'SETTINGS_UPDATED') {
    settings = { ...settings, ...message.settings };
    chrome.runtime.sendMessage({ type: 'SET_SPEED', speed: settings.speed });
  }

  if (message.type === 'AUDIO_ENDED') {
    if (isPlaying && !isPaused) {
      playChunk(currentChunkIndex + 1);
    }
  }

  if (message.type === 'AUDIO_ERROR') {
    stopPlayback();
  }

  // OCR: Handle image read request
  if (message.type === 'CONTEXT_MENU_READ_IMAGE') {
    console.log('[Guacamayo] Received image OCR request:', message.imageUrl);
    handleImageOcr(message.imageUrl);
  }

  // OCR: Progress update
  if (message.type === 'OCR_PROGRESS') {
    updateOcrProgress(message.progress, `Extracting text... ${message.progress}%`);
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
