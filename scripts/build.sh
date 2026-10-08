#!/usr/bin/env bash
# يبني الفيلم كاملًا: صورة → صوت → دمج نهائي في output/
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build output

echo "① تصدير الإطارات (Chromium → ffmpeg)…"
node scripts/render.mjs

echo "② توليد الموسيقى والمؤثرات…"
python3 scripts/audio.py

echo "③ الدمج وضبط علو الصوت (-16 LUFS)…"
ffmpeg -y -loglevel error -i build/video.mp4 -i build/audio.wav \
  -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k \
  -t 30 -movflags +faststart output/saint-paul-one-thread-30s.mp4

ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact output/saint-paul-one-thread-30s.mp4
echo "✓ output/saint-paul-one-thread-30s.mp4"
