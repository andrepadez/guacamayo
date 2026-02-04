const EXCLUDED_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'input', 'textarea', 'select', 'noscript', 'iframe'];

let isPlaying = false;
let isPaused = false;
let settings = { apiKey: '', voice: 'aura-2-thalia-en', speed: 1 };
let textChunks = [];
let currentChunkIndex = 0;
let audioCache = new Map();
let highlightOverlay = null;
let clickHandler = null;

// New: context menu selection state
let lastRightClickedElement = null;
let selectedContainer = null;
let inlineControlsEl = null;

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
  if (!selectedContainer || isPlaying) return;

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateHierarchy(1); // Expand to parent
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateHierarchy(-1); // Shrink to child
  }
}

function chunkText(text, maxLength = 400) {
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
  if (index >= textChunks.length) {
    stopPlayback();
    return;
  }

  currentChunkIndex = index;
  highlightChunk(index);

  let audioData = audioCache.get(index);

  if (!audioData) {
    updateInlineControlsUI('loading');
    try {
      audioData = await synthesizeSpeech(textChunks[index]);
    } catch (error) {
      console.error('Playback error:', error);
      stopPlayback();
      return;
    }
  }

  if (!isPlaying) return;

  audioCache.delete(index);

  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'PLAY_AUDIO',
        audioData,
        speed: settings.speed
      }, response => {
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

    updateInlineControlsUI('playing');
    prefetchChunks(index + 1, 2);
  } catch (error) {
    console.error('Play error:', error);
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
  inlineControlsEl.innerHTML = `
    <button class="guacamayo-inline-btn" title="Play (scroll to change selection)">
      <svg class="guacamayo-icon-play" viewBox="0 0 24 24" width="20" height="20">
        <path fill="currentColor" d="M8 5v14l11-7z"/>
      </svg>
      <svg class="guacamayo-icon-pause" viewBox="0 0 24 24" width="20" height="20" style="display:none">
        <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
      <div class="guacamayo-spinner" style="display:none"></div>
    </button>
  `;

  document.body.appendChild(inlineControlsEl);
  positionInlineControls();

  inlineControlsEl.querySelector('.guacamayo-inline-btn').addEventListener('click', togglePlayback);

  // Set up wheel and keyboard navigation
  wheelHandler = handleWheelNavigation;
  keyHandler = handleKeyNavigation;
  document.addEventListener('wheel', wheelHandler, { passive: false });
  document.addEventListener('keydown', keyHandler);
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
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  containerHierarchy = [];
  currentHierarchyIndex = 0;
  if (isPlaying || isPaused) {
    stopPlayback();
  }
}

function positionInlineControls() {
  if (!selectedContainer || !inlineControlsEl) return;
  const rect = selectedContainer.getBoundingClientRect();
  inlineControlsEl.style.top = `${rect.top + window.scrollY - 16}px`;
  inlineControlsEl.style.left = `${rect.left + window.scrollX - 16}px`;
}

function updateInlineControlsUI(state) {
  if (!inlineControlsEl) return;

  const playIcon = inlineControlsEl.querySelector('.guacamayo-icon-play');
  const pauseIcon = inlineControlsEl.querySelector('.guacamayo-icon-pause');
  const spinner = inlineControlsEl.querySelector('.guacamayo-spinner');
  const btn = inlineControlsEl.querySelector('.guacamayo-inline-btn');

  switch (state) {
    case 'loading':
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'none';
      spinner.style.display = 'block';
      btn.classList.add('loading');
      btn.classList.remove('playing');
      break;
    case 'playing':
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      spinner.style.display = 'none';
      btn.classList.remove('loading');
      btn.classList.add('playing');
      break;
    case 'paused':
    case 'idle':
    default:
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      spinner.style.display = 'none';
      btn.classList.remove('loading', 'playing');
      break;
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
    console.error('No readable content in selected container');
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

// Reposition controls on scroll/resize
window.addEventListener('scroll', positionInlineControls);
window.addEventListener('resize', positionInlineControls);

function init() {
  chrome.storage.local.get(['apiKey', 'voice', 'speed'], (result) => {
    settings = { ...settings, ...result };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTEXT_MENU_READ') {
    if (lastRightClickedElement) {
      // Build hierarchy from the clicked element
      const hierarchy = buildContainerHierarchy(lastRightClickedElement);
      if (hierarchy.length > 0) {
        // Start with the smallest readable container (index 0)
        selectContainer(hierarchy[0], hierarchy, 0);
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
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
