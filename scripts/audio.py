#!/usr/bin/env python3
"""الموسيقى والمؤثرات — تُولَّد بالكامل بالكود (numpy فقط) ومتزامنة مع build/timeline.json.

الفكرة الصوتية:
- «إيسون»: نغمة قرار ممتدة (D) كما في الألحان القبطية، تتنفس مع الفيلم.
- صوت جوقة واحد يرنّم لحنًا بسيطًا… ثم يصير صوتين عند لقاء الخيطين (القادم الجديد + الخادم).
- المثلث والناقوس (الصنج الصغير) — آلات الألحان القبطية — يظهر إيقاعهما عند اجتماع الخيطين ويتصاعد مع رسم الصليب.
- عند نبض القلب يصمت اللحن ويبقى القلب.
- عند اكتمال الصليب: انفراج إلى سلم كبير (D major) ثم قفلة هادئة.

الاستخدام: python3 scripts/audio.py  →  build/audio.wav
"""
import json
import os
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
SR = 48000
TL = json.load(open(os.path.join(BUILD, 'timeline.json')))
DUR = TL['duration']
N = int(DUR * SR)
rng = np.random.default_rng(1234)
t_all = np.arange(N) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_points(points):
    """غلاف خطي من نقاط (زمن، قيمة)."""
    ts, vs = zip(*points)
    return np.interp(t_all, ts, vs)


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def place(buf, sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(sig)] += sig * gain * l * 1.414
    buf[1, i:i + len(sig)] += sig * gain * r * 1.414


# ───────────── الآلات
def voice(f0, dur, amp=1.0, seed=0):
    """صوت جوقة «آه» بتركيب جمعي مع مُشكِّلات (formants) واهتزاز صوتي."""
    r = np.random.default_rng(seed)
    rel = 0.6
    n = int((dur + rel) * SR)
    tt = np.arange(n) / SR
    vib = 1 + 0.0055 * np.sin(2 * np.pi * 5.1 * tt + r.uniform(0, 6)) * np.clip((tt - 0.25) / 0.4, 0, 1)
    drift = 1 + 0.0015 * np.sin(2 * np.pi * 0.7 * tt + r.uniform(0, 6))
    phase = 2 * np.pi * np.cumsum(f0 * vib * drift) / SR
    formants = [(730, 90, 1.0), (1090, 110, 0.5), (2440, 170, 0.25), (3400, 250, 0.08)]
    out = np.zeros(n)
    k = 1
    while f0 * k < 5000:
        fk = f0 * k
        a = sum(g * np.exp(-0.5 * ((fk - F) / (bw * 1.6)) ** 2) for F, bw, g in formants)
        a = a * 0.9 + 0.25 / k
        out += a * np.sin(k * phase + r.uniform(0, 6))
        k += 1
    att = 0.28
    e = np.clip(tt / att, 0, 1) ** 1.5
    e *= np.where(tt > dur, np.exp(-(tt - dur) / (rel / 3)), 1.0)
    # تنفس خفيف
    breath = bandpass(r.standard_normal(n), 900, 4000) * 0.015
    return (out * e + breath * e) * amp / 3.0


def choir(midis, start, dur, buf, amp=1.0):  # noqa
    for j, m in enumerate(midis):
        for v, (cents, pan, dt) in enumerate([(-7, -0.5, 0.0), (0, 0.0, 0.02), (6, 0.5, 0.035)]):
            f = midi(m) * 2 ** (cents / 1200)
            place(buf, voice(f, dur, amp * (0.85 if j else 1.0), seed=hash((m, start, v)) % 10000), start + dt, 0.33, pan)


def triangle(amp=1.0, seed=0):
    r = np.random.default_rng(seed + 77)
    n = int(3.5 * SR)
    tt = np.arange(n) / SR
    f0 = 1180 * r.uniform(0.995, 1.005)
    out = np.zeros(n)
    for ratio, a, dec in [(1, 1, 2.6), (2.05, .6, 2.0), (2.98, .5, 1.6), (4.07, .35, 1.2), (5.1, .3, 0.9), (6.3, .2, 0.6), (7.6, .12, 0.4)]:
        out += a * np.sin(2 * np.pi * f0 * ratio * tt + r.uniform(0, 6)) * np.exp(-tt / dec)
    click = bandpass(r.standard_normal(n), 3000, 12000) * np.exp(-tt / 0.004) * 0.6
    return (out * 0.22 + click) * amp


def naqus(amp=1.0, seed=0, decay=0.9):
    """صنج صغير معدني (ناقوس)."""
    r = np.random.default_rng(seed + 991)
    n = int(2.5 * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for _ in range(36):
        f = r.uniform(2400, 9500)
        out += r.uniform(0.2, 1) * np.sin(2 * np.pi * f * tt + r.uniform(0, 6)) * np.exp(-tt / (decay * r.uniform(0.4, 1.0)))
    out /= 36
    hiss = bandpass(r.standard_normal(n), 4000, 14000) * np.exp(-tt / 0.18) * 0.5
    return (out * 0.9 + hiss) * amp


def heartbeat(amp=1.0):
    n = int(0.8 * SR)
    tt = np.arange(n) / SR

    def thump(f_start, f_end, dec, a, delay):
        x = np.zeros(n)
        i = int(delay * SR)
        u = tt[: n - i]
        f = f_end + (f_start - f_end) * np.exp(-u / 0.04)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x[i:] = a * np.sin(ph) * np.exp(-u / dec) * np.clip(u / 0.004, 0, 1)
        return x
    s = thump(95, 46, 0.11, 1.0, 0) + thump(105, 52, 0.09, 0.62, 0.23)
    return s * amp


def boom(amp=1.0):
    n = int(4 * SR)
    tt = np.arange(n) / SR
    f = 42 + 30 * np.exp(-tt / 0.08)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return amp * (np.sin(ph) * np.exp(-tt / 1.4) + 0.3 * np.sin(2 * ph) * np.exp(-tt / 0.6))


# ───────────── البناء
# طبقات منفصلة لضبط التوازن
S = {k: np.zeros((2, N)) for k in ('drone', 'choir', 'perc', 'fx_wet', 'dry')}
GAIN = {'drone': 1.3, 'choir': 0.4, 'perc': 1.7, 'fx_wet': 8.0, 'dry': 1.0}

# 1) الإيسون (قرار ممتد)
beats = TL['beats']
cd = TL['crossDone']
drone_env = env_points([(0, 0), (0.5, 0), (3.5, 0.75), (9.5, 0.8), (12.5, 1.0), (13.3, 0.9), (13.9, 0.38), (16.6, 0.42),
                        (17.6, 0.8), (cd - 0.05, 1.15), (cd + 0.4, 1.25), (24.5, 1.0), (28.0, 0.8), (30, 0.0)])
breath = 1 + 0.08 * np.sin(2 * np.pi * 0.11 * t_all) + 0.05 * np.sin(2 * np.pi * 0.23 * t_all + 1)
for f, a, pan in [(73.42, 1.0, -0.2), (110.0, 0.55, 0.2), (146.83, 0.4, 0.0), (220.0, 0.12, -0.3)]:
    for det in (-0.12, 0.12):
        ph = 2 * np.pi * (f + det) * t_all
        sig = sum((1 / k ** 1.6) * np.sin(k * ph + k) for k in range(1, 9))
        place(S['drone'], sig * drone_env * breath * a * 0.05, 0, 1, pan)
# انفراج إلى D الكبير بعد اكتمال الصليب
major_env = env_points([(0, 0), (cd - 0.02, 0), (cd + 0.5, 1), (24.5, 0.8), (28.5, 0.5), (30, 0)])
for f, a, pan in [(185.0, 0.35, 0.3), (220.0, 0.3, -0.3), (293.66, 0.22, 0.1)]:
    ph = 2 * np.pi * f * t_all
    sig = sum((1 / k ** 1.8) * np.sin(k * ph + k) for k in range(1, 6))
    place(S['drone'], sig * major_env * a * 0.05, 0, 1, pan)

# 2) اللحن (صوت واحد… ثم صوتان عند الضفيرة)
MELODY = [
    (2.0, 1.0, [57]), (3.0, .5, [58]), (3.5, .5, [57]), (4.0, 1.0, [55]), (5.0, 1.5, [57]),
    (6.6, .8, [62]), (7.4, .6, [60]), (8.0, .6, [58]), (8.6, 1.3, [57]),
    (10.0, 1.0, [57, 53]), (11.0, .5, [58, 55]), (11.5, .5, [60, 57]), (12.0, 1.0, [62, 58]), (13.0, .6, [57, 53]),
    (17.6, .9, [62, 57]), (18.5, .8, [64, 60]), (19.3, .8, [65, 62]), (20.1, .8, [67, 64]), (20.9, .45, [69, 65]),
    (cd, 2.6, [62, 66, 69, 74]),
    (25.2, .8, [69]), (26.0, .5, [67]), (26.5, .6, [66]), (27.1, .6, [64]), (27.7, 1.9, [62, 57]),
]
for start, dur, ms in MELODY:
    choir(ms, start, dur, S['choir'], amp=1.25 if start == cd else 1.0)

# 3) المثلث والناقوس
place(S['perc'], triangle(0.55, 1), TL['spark'], 1, 0.15)
for i, ts in enumerate([3.0, 4.7, 6.6]):
    place(S['perc'], triangle(0.16, 10 + i), ts, 1, 0.3)
place(S['perc'], triangle(0.25, 20), TL['strand'][0] - 0.4, 1, -0.3)  # ظهور القادم الجديد
bt = 0.75
for i, ts in enumerate(np.arange(10.0, 13.01, bt)):
    place(S['perc'], naqus(0.22 if i % 2 == 0 else 0.14, 100 + i), ts, 1, -0.25)
    place(S['perc'], triangle(0.18 if i % 2 == 0 else 0.11, 200 + i), ts, 1, 0.3)
    place(S['perc'], triangle(0.08, 300 + i), ts + bt / 2, 1, 0.35)
# تصاعد مع رسم الصليب
ts, gap, i = 17.6, 0.62, 0
while ts < cd - 0.12:
    prog = (ts - 17.6) / (cd - 17.6)
    place(S['perc'], naqus(0.10 + 0.32 * prog ** 1.5, 400 + i, decay=0.5), ts, 1, -0.25)
    place(S['perc'], triangle(0.08 + 0.18 * prog, 500 + i), ts, 1, 0.3)
    ts += gap
    gap = max(0.17, gap * 0.9)
    i += 1
place(S['perc'], naqus(0.85, 999, decay=1.4), cd, 1, -0.2)
place(S['perc'], triangle(0.85, 998), cd, 1, 0.25)
place(S['dry'], boom(0.55), cd, 1, 0)
place(S['perc'], triangle(0.35, 997), 25.2, 1, 0.2)
place(S['perc'], triangle(0.5, 996), 27.7, 1, 0.1)

# 4) القلب
for b in beats:
    place(S['dry'], heartbeat(0.75), b - 0.01, 1, 0)

# 5) خشخشة القلم على الرق (تتبع سرعة القلم الحقيقية على الشاشة)
pen = np.array(TL['penSpeed'], dtype=float)
pen_t = np.arange(len(pen)) / TL['fps']
v = np.interp(t_all, pen_t, pen)
grain = np.abs(bandpass(rng.standard_normal(N), 3, 40))
grain /= grain.max()
scratch = bandpass(rng.standard_normal(N), 1800, 6500) * (0.45 + 0.9 * grain)
g = np.clip(v / 900, 0, 1.3) * 0.022
place(S['dry'], scratch * g, 0, 1, 0.05)

# 6) شرارة الاشتعال
n = int(0.7 * SR)
tt = np.arange(n) / SR
whoosh = bandpass(rng.standard_normal(n), 500, 5000) * np.clip(tt / 0.05, 0, 1) * np.exp(-tt / 0.18) * 0.12
place(S['dry'], whoosh, TL['spark'] - 0.03, 1, 0)

# 7) بريق يعبر الخيط أثناء الابتعاد
o0, o1 = 22.5, 24.3
n = int((o1 - o0 + 1.5) * SR)
tt = np.arange(n) / SR
for k, base in enumerate([1480, 1975, 2350]):
    f = base * (1 + 0.5 * np.clip(tt / (o1 - o0), 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = np.sin(np.pi * np.clip(tt / (o1 - o0 + 0.6), 0, 1)) ** 2
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * (7 + k) * tt)
    place(S['fx_wet'], np.sin(ph) * e * trem * 0.012, o0, 1, [-0.5, 0.5, 0][k])

# ───────────── صدى كنسي (استجابة نبضية مولّدة)
ir_len = int(3.2 * SR)
ti = np.arange(ir_len) / SR
ir = np.zeros((2, ir_len))
for ch in range(2):
    noise = rng.standard_normal(ir_len)
    noise = bandpass(noise, 120, 6000)
    ir[ch] = noise * np.exp(-ti / 0.55) * np.clip(ti / 0.01, 0, 1)
    ir[ch, : int(0.022 * SR)] = 0
    ir[ch] /= np.sqrt(np.sum(ir[ch] ** 2))
for k, v in S.items():
    print(f'  stem {k:7s} rms {20*np.log10(np.sqrt((v**2).mean())+1e-12)*1:6.1f} dB  ×{GAIN[k]}')
music = sum(S[k] * GAIN[k] for k in ('drone', 'choir', 'perc', 'fx_wet'))
dry = S['dry'] * GAIN['dry']
L = 1 << int(np.ceil(np.log2(N + ir_len)))
wet = np.zeros((2, N))
for ch in range(2):
    wet[ch] = np.fft.irfft(np.fft.rfft(music[ch], L) * np.fft.rfft(ir[ch], L), L)[:N]
mix = music * 0.8 + wet * 0.55 + dry * 0.9

# ───────────── ماستر
master = env_points([(0, 1), (29.3, 1), (30, 0)])
mix *= master
mix = np.tanh(mix * 1.2) / 1.2  # تليين القمم
peak = np.max(np.abs(mix))
mix = mix / peak * 10 ** (-1 / 20)

out = os.path.join(BUILD, 'audio.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes())
print('audio →', out, f'{DUR}s', 'beats', beats)
