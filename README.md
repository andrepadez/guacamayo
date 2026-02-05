# Guacamayo

A browser extension that reads web content aloud using AI-powered text-to-speech. Select any text or image and have it read to you with natural-sounding voices.

## Features

- **Text-to-Speech**: Right-click any text to have it read aloud using Deepgram's Aura voices
- **Image OCR**: Right-click images to extract and read text using AI vision models
- **Smart Selection**: Scroll or use arrow keys to expand/shrink the reading area
- **Multiple Voices**: 20+ voices across English, Spanish, German, and French
- **Playback Controls**: Play/pause, skip forward/backward, adjustable speed (0.5x - 2x)
- **Progress Indicator**: Visual feedback showing current chunk and playback progress
- **Keyboard Shortcuts**: Full keyboard control for hands-free operation

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder

## Setup

You'll need API keys from two providers:

1. **Deepgram** (for text-to-speech): [Get API key](https://developers.deepgram.com)
2. **DeepInfra** (for image OCR): [Get API key](https://deepinfra.com/dash/api_keys)

Click the extension icon and enter your API keys in the settings popup.

## Usage

### Reading Text

1. Right-click on any text content
2. Select **"Read with Guacamayo"**
3. The text area will be highlighted
4. Use scroll wheel or **↑↓** keys to adjust the selection
5. Click the play button or press **Space** to start

### Reading Images

1. Right-click on any image containing text
2. Select **"Read image with Guacamayo"**
3. The text will be extracted using OCR and read aloud

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play / Pause |
| **←** | Skip to previous chunk |
| **→** | Skip to next chunk |
| **↑** | Expand selection to parent element |
| **↓** | Shrink selection to child element |
| **Esc** | Stop playback and dismiss selection |

## OCR Models

Choose from multiple vision models for image text extraction:

**OCR Specialized**
- DeepSeek OCR - Fast and accurate
- olmOCR-2 - Handles complex layouts well
- PaddleOCR-VL - Lightweight option

**Qwen Vision**
- Qwen3-VL-30B
- Qwen3-VL-235B - Most capable

## Voices

**English**
- Thalia, Andromeda, Helena, Asteria, Athena, Aurora, Cora (feminine)
- Apollo, Arcas, Aries, Draco, Hermes, Orion, Orpheus, Zeus (masculine)

**Spanish**: Celeste (Colombian), Estrella (Mexican), Nestor (Peninsular)

**German**: Julius, Viktoria

**French**: Agathe, Hector

## Tech Stack

- Chrome Extension Manifest V3
- [Deepgram Aura](https://deepgram.com/product/text-to-speech) - Text-to-speech API
- [DeepInfra](https://deepinfra.com) - Vision model inference for OCR

## License

MIT
