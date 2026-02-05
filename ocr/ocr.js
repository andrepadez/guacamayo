// Helper to send debug logs to background script
function debugLog(...args) {
  console.log(...args);
  chrome.runtime.sendMessage({ type: 'OCR_DEBUG', message: args.join(' ') }).catch(() => {});
}

// OCR Provider interface - easy to swap implementations
const OCRProviders = {
  tesseract: {
    name: 'Tesseract.js',
    requiresApiKey: false,

    async extractText(imageData, options = {}) {
      const lang = options.language || 'eng';

      debugLog('[OCR] extractText called, lang:', lang);

      try {
        // Let Tesseract use CDN defaults - test if basic OCR works first
        debugLog('[OCR] Calling Tesseract.recognize...');
        const result = await Tesseract.recognize(imageData, lang, {
          logger: (m) => {
            debugLog('[OCR] Tesseract:', m.status, Math.round((m.progress || 0) * 100) + '%');
            if (m.status === 'recognizing text') {
              chrome.runtime.sendMessage({
                type: 'OCR_PROGRESS',
                progress: 50 + Math.round(m.progress * 50)
              }).catch(() => {});
            }
          }
        });

        debugLog('[OCR] Tesseract result received, text length:', result.data?.text?.length);
        return {
          success: true,
          text: result.data.text.trim(),
          confidence: result.data.confidence
        };
      } catch (error) {
        debugLog('[OCR] Tesseract error:', String(error), JSON.stringify(error));
        return {
          success: false,
          error: error.message || String(error) || 'Unknown OCR error'
        };
      }
    }
  }

  // Future providers can be added here:
  // openai: { ... },
  // claude: { ... },
  // googleVision: { ... },
};

// Current provider (can be made configurable)
let currentProvider = 'tesseract';

// Listen for OCR requests from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log ALL messages to debug
  debugLog('[OCR] Received message:', message.type, 'target:', message.target);

  if (message.target !== 'ocr') {
    return;
  }

  if (message.type === 'EXTRACT_TEXT') {
    debugLog('[OCR] Starting extraction, language:', message.options?.language || 'eng');
    debugLog('[OCR] Image data length:', message.imageData?.length || 0);

    const provider = OCRProviders[currentProvider];

    provider.extractText(message.imageData, message.options)
      .then(result => {
        debugLog('[OCR] Extraction complete, success:', result.success, 'error:', result.error || 'none');
        if (result.success) {
          debugLog('[OCR] Text preview:', result.text?.substring(0, 50));
        }
        chrome.runtime.sendMessage({
          type: 'OCR_COMPLETE',
          ...result,
          requestId: message.requestId
        });
      })
      .catch(error => {
        debugLog('[OCR] Extraction exception:', error.message, error.stack);
        chrome.runtime.sendMessage({
          type: 'OCR_COMPLETE',
          success: false,
          error: error.message,
          requestId: message.requestId
        });
      });

    return;
  }

  if (message.type === 'SET_PROVIDER') {
    if (OCRProviders[message.provider]) {
      currentProvider = message.provider;
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Unknown provider' });
    }
    return true;
  }
});

console.log('[Guacamayo OCR] Module loaded');
console.log('[Guacamayo OCR] Tesseract available:', typeof Tesseract !== 'undefined');

// Notify background that OCR module is ready
chrome.runtime.sendMessage({
  type: 'OCR_MODULE_READY',
  tesseractAvailable: typeof Tesseract !== 'undefined'
}).catch(() => {});
