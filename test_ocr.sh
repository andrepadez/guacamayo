#!/bin/bash

IMAGE_PATH="${1:-./testocr.jpeg}"
SERVER="${2:-macmini:1234}"

if [ ! -f "$IMAGE_PATH" ]; then
    echo "Error: Image not found at $IMAGE_PATH"
    exit 1
fi

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Base64 encode without line breaks
base64 -i "$IMAGE_PATH" | tr -d '\n' > "$TMPDIR/img.b64"

# Build JSON file piece by piece
printf '{"model":"qwen/qwen2.5-vl-7b","messages":[{"role":"user","content":[{"type":"text","text":"Extract all text from this image"},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,' > "$TMPDIR/request.json"
cat "$TMPDIR/img.b64" >> "$TMPDIR/request.json"
printf '"}}]}]}' >> "$TMPDIR/request.json"

curl -s "http://${SERVER}/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d @"$TMPDIR/request.json" | jq -r '.choices[0].message.content'
