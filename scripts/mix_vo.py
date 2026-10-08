#!/usr/bin/env python3
"""يدمج التعليق الصوتي (ملفات Gemini TTS) مع موسيقى الفيلم ويُخرج نسخة MP4 بالصوت.

ضع الملفات في مجلد vo/ بالأسماء 01 … 07 (أي امتداد: wav / mp3 / m4a …):
    vo/01.wav  vo/02.wav  …  vo/07.wav
ثم:
    python3 scripts/mix_vo.py
الناتج: output/saint-paul-one-thread-30s-vo.mp4

ما يفعله تلقائيًا:
- يقص الصمت من بداية ونهاية كل ملف (Gemini يضيف صمتًا غالبًا) حتى يبدأ الكلام في موعده بالضبط.
- يوحّد علو الجمل، ويضيف صدى كنسيًا خفيفًا ليجلس الصوت داخل الموسيقى.
- يخفض الموسيقى تحت كل جملة بنعومة (ducking) ثم يعيدها.
- يحذّر إن كانت جملة أطول من مساحتها في الفيلم.
لتحريك جملة: عدّل "start" في vo/cues.json (يُنشأ تلقائيًا أول مرة).
"""
import glob
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VO = os.path.join(ROOT, 'vo')
BUILD = os.path.join(ROOT, 'build')
SR = 48000

# start = لحظة بدء الكلام، end = آخر لحظة مسموح أن ينتهي عندها
DEFAULT_CUES = [
    {'id': '01', 'start': 1.4, 'end': 4.2, 'text': 'يَبْدَأُ الطَّرِيقُ… بِالإِيمَان.'},
    {'id': '02', 'start': 4.8, 'end': 8.6, 'text': 'وَيُبْنَى بِالمَعْرِفَة: مَكْتَبَةٌ تَعْلِيمِيَّة، وَمَدْرَسَةٌ أُونْلَايْن.'},
    {'id': '03', 'start': 10.3, 'end': 13.6, 'text': 'يَجْمَعُ مَنْ يَبْدَأُ الطَّرِيق… وَمَنْ يَخْدِمُ فِيه.'},
    {'id': '04', 'start': 14.1, 'end': 16.6, 'text': 'وَيَمْتَدُّ… إِلَى مَنْ يُدَاوِي.'},
    {'id': '05', 'start': 19.4, 'end': 21.35, 'text': 'حَتَّى يَصِيرَ اسْتِعْدَادًا لِلْخِدْمَة.'},
    {'id': '06', 'start': 25.4, 'end': 27.4, 'text': 'خِدْمَةُ القِدِّيسِ بُولُس القِبْطِيَّة.'},
    {'id': '07', 'start': 27.6, 'end': 29.4, 'text': '«مُفَصِّلًا كَلِمَةَ الحَقِّ… بِالاسْتِقَامَة».'},
]
DUCK_DB = -8.0   # كم تنخفض الموسيقى تحت الكلام
VO_REVERB = 0.14 # نسبة الصدى على الصوت


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<f4').astype(np.float64)


def trim(x, thresh_db=-42, pad=0.03):
    win = int(0.01 * SR)
    e = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, 'same'))
    on = np.where(e > np.max(e) * 10 ** (thresh_db / 20))[0]
    if len(on) == 0:
        return x
    a = max(0, on[0] - int(pad * SR))
    b = min(len(x), on[-1] + int(pad * 4 * SR))
    return x[a:b]


def highpass(x, fc=90):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (fc / np.maximum(f, 1)) ** 4) ** 0.5, len(x))


def conv(x, ir):
    L = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), L)[:len(x)]


def main():
    os.makedirs(VO, exist_ok=True)
    cues_path = os.path.join(VO, 'cues.json')
    if not os.path.exists(cues_path):
        json.dump(DEFAULT_CUES, open(cues_path, 'w'), ensure_ascii=False, indent=2)
    cues = json.load(open(cues_path))

    bed_path = os.path.join(BUILD, 'audio.wav')
    if not os.path.exists(bed_path):
        sys.exit('build/audio.wav غير موجود — شغّل أولًا: python3 scripts/audio.py')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', bed_path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    bed = np.frombuffer(raw, '<f4').astype(np.float64).reshape(-1, 2).T.copy()
    N = bed.shape[1]

    rng = np.random.default_rng(5)
    ti = np.arange(int(1.4 * SR)) / SR
    ir = [rng.standard_normal(len(ti)) * np.exp(-ti / 0.32) for _ in range(2)]
    for r in ir:
        r[: int(0.018 * SR)] = 0
        r /= np.sqrt(np.sum(r ** 2))

    vo = np.zeros((2, N))
    active = np.zeros(N)
    found = 0
    for c in cues:
        files = sorted(glob.glob(os.path.join(VO, c['id'] + '.*')))
        files = [f for f in files if not f.endswith('.json')]
        if not files:
            print(f"  ⚠ {c['id']}: لا يوجد ملف — تخطّي  ({c['text']})")
            continue
        x = trim(highpass(load(files[0])))
        x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.1  # توحيد العلو
        dur = len(x) / SR
        end = c['start'] + dur
        flag = '✓' if end <= c['end'] else f"⚠ أطول بـ {end - c['end']:.2f} ث — أعد التوليد بإيقاع أسرع قليلًا"
        print(f"  {c['id']}: {dur:.2f} ث  ({c['start']:.2f} → {end:.2f}, المسموح حتى {c['end']:.2f})  {flag}")
        i = int(c['start'] * SR)
        x = x[: max(0, N - i)]
        for ch in range(2):
            vo[ch, i:i + len(x)] += x
        active[i:i + len(x)] = 1
        found += 1
    if not found:
        sys.exit('لم أجد أي ملف صوت في vo/ — سمِّ الملفات 01.wav … 07.wav')

    wet = np.stack([conv(vo[ch], ir[ch]) for ch in range(2)])
    vo = vo + wet * VO_REVERB

    # منحنى خفض الموسيقى: يبدأ قبل الكلام بـ 0.15 ث ويعود بعده بـ 0.45 ث
    pre, post = int(0.15 * SR), int(0.45 * SR)
    act = active.copy()
    idx = np.where(np.diff(np.concatenate([[0], active, [0]])) != 0)[0].reshape(-1, 2)
    for a, b in idx:
        act[max(0, a - pre):min(N, b + post)] = 1
    k = int(0.12 * SR)
    act = np.convolve(act, np.ones(k) / k, 'same')
    duck = 10 ** (DUCK_DB * act / 20)

    mix = bed * duck + vo * 1.0
    mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
    wav = os.path.join(BUILD, 'audio_vo.wav')
    import wave
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes())

    video = os.path.join(BUILD, 'video.mp4')
    if not os.path.exists(video):
        sys.exit('build/video.mp4 غير موجود — شغّل: node scripts/render.mjs')
    out = os.path.join(ROOT, 'output', 'saint-paul-one-thread-30s-vo.mp4')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k',
                    '-t', '30', '-movflags', '+faststart', out], check=True)
    print('✓', out)


if __name__ == '__main__':
    main()
