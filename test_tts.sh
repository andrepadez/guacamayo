#!/bin/bash

TEXT="${1:-Hello, the text to speech system is working correctly.}"
SERVER="${2:-macmini:9002}"
VOICE="${3:-af_heart}"
OUTPUT="/tmp/tts_output.mp3"

curl -s "http://${SERVER}/v1/audio/speech" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"mlx-community/Kokoro-82M-bf16\", \"input\": \"${TEXT}\", \"voice\": \"${VOICE}\"}" \
  --output "$OUTPUT" && mpv --no-video "$OUTPUT"
