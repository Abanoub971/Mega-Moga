// «خيط واحد» — فيلم تعريفي لخدمة القديس بولس القبطية (30 ثانية)
// كل إطار دالة خالصة في الزمن t: renderFrame(t) — لذلك التصدير إطارًا بإطار مطابق للمعاينة.
import { TEXT, COLORS } from './config.js';

export const W = 1920, H = 1080, FPS = 30, DURATION = 30;

// ───────────────────────── أدوات
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const sramp = (t, a, b) => smooth(ramp(t, a, b));
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const fade = (t, in0, in1, out0, out1) => sramp(t, in0, in1) * (1 - sramp(t, out0, out1));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── بناء المسار (خط واحد بإحداثيات العالم)
class PathBuilder {
  constructor(x, y) { this.pts = [[x, y]]; this.len = [0]; this.anchors = {}; }
  get last() { return this.pts[this.pts.length - 1]; }
  get total() { return this.len[this.len.length - 1]; }
  push(x, y) {
    const [px, py] = this.last;
    const d = Math.hypot(x - px, y - py);
    if (d < 1e-6) return;
    this.pts.push([x, y]);
    this.len.push(this.total + d);
  }
  lineTo(x, y, step = 3) {
    const [px, py] = this.last;
    const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / step));
    for (let i = 1; i <= n; i++) this.push(lerp(px, x, i / n), lerp(py, y, i / n));
    return this;
  }
  cubicTo(c1x, c1y, c2x, c2y, x, y) {
    const [px, py] = this.last;
    const est = Math.hypot(c1x - px, c1y - py) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y);
    const n = Math.max(6, Math.ceil(est / 2.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.push(
        u * u * u * px + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * py + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      );
    }
    return this;
  }
  arc(cx, cy, r, a0, a1) {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 2.5));
    this.lineTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    for (let i = 1; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      this.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return this;
  }
  mark(name) { this.anchors[name] = this.total; return this; }
  indexAt(s) {
    let lo = 0, hi = this.len.length - 1;
    if (s <= 0) return 0;
    if (s >= this.total) return hi;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.len[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  pointAt(s) {
    s = clamp(s, 0, this.total);
    const i = this.indexAt(s);
    if (i >= this.pts.length - 1) return this.pts[this.pts.length - 1];
    const f = (s - this.len[i]) / (this.len[i + 1] - this.len[i]);
    return [lerp(this.pts[i][0], this.pts[i + 1][0], f), lerp(this.pts[i][1], this.pts[i + 1][1], f)];
  }
}

// الصليب القبطي: أربع أذرع متساوية، كل ذراع ينتهي بثلاث فصوص (الثالوث) — 12 نهاية (الرسل).
// يُرسم كخط خارجي واحد مغلق يبدأ من أسفل نقطة في الذراع السفلي.
function crossOutline(cx, cy, S) {
  const arm = [];
  const P = (x, y) => arm.push([x, y]);
  const arcPts = (ox, oy, r, d0, d1) => {
    for (let d = d0; d <= d1 + 1e-9; d += 5) { const a = (d * Math.PI) / 180; P(ox + r * Math.cos(a), oy + r * Math.sin(a)); }
  };
  P(-30, -30); P(-30, -118); P(-44, -150);
  arcPts(-34, -168, 22, 140, 290);
  arcPts(0, -184, 26, 200, 340);
  arcPts(34, -168, 22, 250, 400);
  P(44, -150); P(30, -118); P(30, -30);
  const rot = ([x, y], k) => { for (let i = 0; i < k; i++) [x, y] = [-y, x]; return [x, y]; };
  let loop = [];
  for (let k = 0; k < 4; k++) for (let i = k === 0 ? 0 : 1; i < arm.length; i++) loop.push(rot(arm[i], k));
  loop.pop(); // آخر نقطة تساوي الأولى
  let iMax = 0;
  loop.forEach((p, i) => { if (p[1] > loop[iMax][1] + 1e-6) iMax = i; });
  loop = loop.slice(iMax).concat(loop.slice(0, iMax));
  loop.push(loop[0]);
  return loop.map(([x, y]) => [cx + x * S, cy + y * S]);
}

// ───────────────────────── العالم
const CROSS = { x: -4800, y: -311, S: 1.15 };
const BRAID = { x0: -2200, len: 1100, A: 46, P: 275 };
const ECG_BEAT = [
  [0, 0], [40, 0], [55, -14], [70, -18], [85, -14], [100, 0], [125, 0], [135, 14],
  [150, -170], [165, 52], [178, 0], [215, 0], [235, -26], [255, -32], [275, -26], [295, 0], [320, 0],
];
const SPINES = [[46, 210], [38, 250], [54, 190], [42, 268], [50, 222], [36, 178]];

function buildWorld() {
  const b = new PathBuilder(0, -160);
  b.mark('start');
  // من اللهب: يصعد كخيط دخان ثم ينحني نحو اليسار (اتجاه الكتابة العربية)
  b.cubicTo(0, -300, -200, -330, -260, -175);
  b.cubicTo(-300, -60, -360, 0, -440, 0);
  b.lineTo(-520, 0).mark('bookStart');
  // كتاب مفتوح
  b.lineTo(-590, -8).lineTo(-590, -190);
  b.cubicTo(-660, -228, -760, -218, -820, -172);
  b.lineTo(-820, -12).lineTo(-820, -172);
  b.cubicTo(-880, -218, -980, -228, -1050, -190);
  b.lineTo(-1050, -8).lineTo(-1100, 0);
  b.lineTo(-1180, 0).mark('spinesStart');
  // رف مكتبة
  let x = -1180;
  for (const [w, h] of SPINES) { b.lineTo(x, -h).lineTo(x - w, -h).lineTo(x - w, 0); x -= w; }
  b.lineTo(-1540, 0).mark('screenStart');
  // شاشة درس (مدرسة أونلاين)
  b.lineTo(-1580, 0).lineTo(-1600, -40).lineTo(-1600, -244);
  b.arc(-1616, -244, 16, 0, -Math.PI / 2);
  b.lineTo(-1944, -260);
  b.arc(-1944, -244, 16, -Math.PI / 2, -Math.PI);
  b.lineTo(-1960, -40).lineTo(-1980, 0).lineTo(-2000, 0).mark('screenEnd');
  b.lineTo(BRAID.x0, 0).mark('braidStart');
  // الضفيرة: الخيط الأول
  const braidY = xb => BRAID.A * Math.sin((2 * Math.PI * xb) / BRAID.P) * sramp(xb, 0, 140) * (1 - sramp(xb, BRAID.len - 160, BRAID.len));
  for (let xb = 3; xb <= BRAID.len; xb += 3) b.push(BRAID.x0 - xb, braidY(xb));
  b.mark('braidEnd');
  b.lineTo(-3400, 0).mark('ecgStart');
  // نبض القلب
  let xs = -3400;
  for (let k = 0; k < 3; k++) {
    for (let i = 1; i < ECG_BEAT.length; i++) {
      b.lineTo(xs - ECG_BEAT[i][0], ECG_BEAT[i][1], 2);
      if (i === 8) b.mark('R' + (k + 1));
    }
    xs -= 320;
  }
  b.lineTo(-4450, 0).mark('ecgEnd');
  // يصعد ليرسم الصليب
  const loop = crossOutline(CROSS.x, CROSS.y, CROSS.S);
  b.cubicTo(-4640, 0, CROSS.x + 40, 30, loop[0][0], loop[0][1]);
  b.mark('crossStart');
  for (let i = 1; i < loop.length; i++) b.lineTo(loop[i][0], loop[i][1], 2.5);
  b.mark('crossEnd');

  // الخيط الثاني: القادم الجديد
  const s2 = new PathBuilder(-2040, 236);
  s2.cubicTo(-2050, 120, -2130, 0, BRAID.x0, 0);
  s2.mark('braidStart');
  for (let xb = 3; xb <= BRAID.len; xb += 3) s2.push(BRAID.x0 - xb, -braidY(xb));

  return { main: b, strand: s2, loop, braidY };
}

const WORLD = buildWorld();
const MAIN = WORLD.main;

// ───────────────────────── الزمن: متى يصل القلم إلى كل محطة
// [اسم المحطة، الزمن، مقدار التليين للجزء الذي يبدأ عندها]
const ANCHORS = [
  ['start', 2.0, 0.55], ['bookStart', 3.0, 0.35], ['spinesStart', 4.7, 0.3], ['screenStart', 6.6, 0.35],
  ['screenEnd', 8.4, 0.75], ['braidStart', 10.0, 0.25], ['braidEnd', 13.0, 0.3], ['ecgStart', 13.4, 0],
  ['ecgEnd', 16.8, 0.25], ['crossStart', 17.6, 0.15], ['crossEnd', 21.4, 0],
].map(([n, t, e]) => ({ n, t, e, s: MAIN.anchors[n] }));

export function penS(t) {
  if (t <= ANCHORS[0].t) return 0;
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i], b = ANCHORS[i + 1];
    if (t < b.t) {
      const u = (t - a.t) / (b.t - a.t);
      return lerp(a.s, b.s, lerp(u, easeInOut(u), a.e));
    }
  }
  return MAIN.total;
}

function timeOfS(s) { // عكس penS بالبحث الثنائي
  let lo = 0, hi = DURATION;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (penS(m) < s) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

const T = {
  spark: 0.5, strand: [9.0, 10.0], crossDone: 21.4,
  overview: [22.2, 24.2], endcard: [24.2, 25.8], fadeOut: [29.4, 30.0],
};

// ───────────────────────── الكاميرا
const OVERVIEW = (() => {
  const xs = MAIN.pts.map(p => p[0]), ys = MAIN.pts.map(p => p[1]);
  const minX = Math.min(...xs) - 120, maxX = Math.max(...xs) + 140;
  const minY = Math.min(...ys) - 60, maxY = 320;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: Math.min((W * 0.9) / (maxX - minX), (H * 0.8) / (maxY - minY)) };
})();
const END_Z = 0.86;
const END_CAM = { x: CROSS.x, y: CROSS.y + (H / 2 - 318) / END_Z, z: END_Z };
const CROSS_CAM = { x: CROSS.x, y: CROSS.y + 92, z: 0.95 };

function penPoint(t) { return MAIN.pointAt(penS(t)); }

function camera(t) {
  // متابعة القلم بنعومة (متوسط موزون لموقعه خلال آخر 0.9 ثانية)
  let sx = 0, sy = 0, sw = 0;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const tt = Math.max(0, t - (0.9 * i) / (n - 1));
    const w = 1 - i / n;
    const [px, py] = penPoint(tt);
    sx += px * w; sy += py * w; sw += w;
  }
  sx /= sw; sy /= sw;
  const lead = lerp(0, 170, sramp(t, 1.8, 3.6));
  let c = {
    x: sx - lead + Math.sin(t * 0.7) * 4,
    y: lerp(-125, sy * 0.35 - 70, sramp(t, 2.0, 3.5)) + Math.sin(t * 0.53 + 1) * 3,
    z: lerp(1.38, 1.0, easeInOut(ramp(t, 0.2, 4.2))),
  };
  const mix = (a, b, w) => ({ x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), w)) });
  c = mix(c, CROSS_CAM, sramp(t, 16.3, 18.3));
  c = mix(c, OVERVIEW, easeInOut(ramp(t, ...T.overview)));
  c = mix(c, END_CAM, easeInOut(ramp(t, ...T.endcard)));
  return c;
}

// ───────────────────────── الرسم
let canvas, ctx, grainTiles = [], particles = [];

export async function init(cnv) {
  canvas = cnv; ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const fonts = [
    ['Aref Ruqaa', 'aref-ruqaa-arabic-700-normal', '700'],
    ['Aref Ruqaa', 'aref-ruqaa-arabic-400-normal', '400'],
    ['Amiri', 'amiri-arabic-400-normal', '400'],
    ['Amiri', 'amiri-latin-400-normal', '400'],
    ['Noto Kufi Arabic', 'noto-kufi-arabic-arabic-400-normal', '400'],
    ['Noto Kufi Arabic', 'noto-kufi-arabic-latin-400-normal', '400'],
    ['Noto Kufi Arabic', 'noto-kufi-arabic-arabic-300-normal', '300'],
    ['Noto Sans Coptic', 'noto-sans-coptic-coptic-400-normal', '400'],
  ];
  await Promise.all(fonts.map(async ([fam, file, weight]) => {
    const f = new FontFace(fam, `url(../assets/fonts/${file}.woff2)`, { weight });
    await f.load(); document.fonts.add(f);
  }));
  await document.fonts.ready;

  // حبيبات فيلم (3 بلاطات تتبدل)
  const rnd = mulberry32(7);
  for (let k = 0; k < 3; k++) {
    const g = document.createElement('canvas'); g.width = g.height = 256;
    const gx = g.getContext('2d'); const img = gx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0); grainTiles.push(g);
  }
  // ذرات بخور
  const pr = mulberry32(21);
  for (let i = 0; i < 150; i++) {
    particles.push({ u: pr(), v: pr(), depth: 0.12 + pr() * 0.5, speed: 6 + pr() * 18, size: 0.7 + pr() * 2.2, ph: pr() * 6.28, a: 0.25 + pr() * 0.75 });
  }
}

function toScreen(c, x, y) { return [(x - c.x) * c.z + W / 2, (y - c.y) * c.z + H / 2]; }

function strokeRange(path, s0, s1, widthPx, color, z) {
  if (s1 <= s0) return;
  const i0 = path.indexAt(s0), i1 = path.indexAt(s1);
  const p0 = path.pointAt(s0), p1 = path.pointAt(s1);
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(path.pts[i][0], path.pts[i][1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineWidth = widthPx / z;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawThread(path, s0, s1, z, inkC, glowC, alpha = 1) {
  if (s1 <= s0 || alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  strokeRange(path, s0, s1, 20, rgba(glowC, 0.05 * alpha), z);
  strokeRange(path, s0, s1, 8, rgba(glowC, 0.16 * alpha), z);
  strokeRange(path, s0, s1, 2.6, rgba(inkC, 0.95 * alpha), z);
  ctx.restore();
}

// نص يُكتب من اليمين إلى اليسار (قناع متدرج) — بإحداثيات العالم أو الشاشة
function revealText(text, font, color, x, y, progress, alpha, sizeScale = 1) {
  if (alpha <= 0.001 || progress <= 0) return;
  ctx.save();
  ctx.font = font; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(text).width;
  const xr = x + w / 2 + 20, xl = x - w / 2 - 20;
  const f = 0.18;
  const p = lerp(-f, 1, clamp(progress)); // حافة الكشف
  const g = ctx.createLinearGradient(xr, 0, xl, 0);
  const c0 = color.replace('ALPHA', alpha.toFixed(3));
  const c1 = color.replace('ALPHA', '0');
  g.addColorStop(0, c0);
  g.addColorStop(clamp(p), c0);
  g.addColorStop(clamp(p + f), c1);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18 * sizeScale;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCandle(t, c) {
  const on = sramp(t, T.spark, T.spark + 0.9);
  if (on <= 0 && t < T.spark - 0.05) return;
  const flick = 1 + 0.06 * Math.sin(t * 13.1) + 0.04 * Math.sin(t * 7.3 + 1) + 0.03 * Math.sin(t * 23.7);
  // هالة
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, -125, 0, 0, -125, 380);
  halo.addColorStop(0, `rgba(255,170,80,${0.32 * on * flick})`);
  halo.addColorStop(0.35, `rgba(200,110,40,${0.10 * on})`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(-400, -520, 800, 800);
  ctx.restore();
  // الشمعة
  ctx.save();
  const body = ctx.createLinearGradient(-24, 0, 24, 0);
  body.addColorStop(0, `rgba(120,86,56,${on})`);
  body.addColorStop(0.45, `rgba(238,214,176,${on})`);
  body.addColorStop(1, `rgba(90,62,40,${on})`);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-23, -88); ctx.quadraticCurveTo(0, -96, 23, -88);
  ctx.lineTo(23, 620); ctx.lineTo(-23, 620); ctx.closePath(); ctx.fill();
  // ضوء أعلى الشمعة يتلاشى للأسفل
  const shade = ctx.createLinearGradient(0, -90, 0, 420);
  shade.addColorStop(0, 'rgba(10,7,5,0)'); shade.addColorStop(1, 'rgba(10,7,5,0.97)');
  ctx.fillStyle = shade; ctx.fillRect(-26, -96, 52, 720);
  // الفتيل
  ctx.strokeStyle = `rgba(30,20,14,${on})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -92); ctx.lineTo(1, -106); ctx.stroke();
  ctx.restore();
  // اللهب
  const grow = t < T.spark ? 0 : easeOut(ramp(t, T.spark, T.spark + 0.7)) * (1 + 0.25 * Math.exp(-(t - T.spark - 0.6) * 4) * (t > T.spark + 0.5 ? 1 : 0));
  if (grow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sway = Math.sin(t * 3.1) * 2.5 + Math.sin(t * 8.3) * 1.2;
    const fh = 58 * grow * flick, fw = 11 * grow;
    const by = -104;
    const fg = ctx.createRadialGradient(0, by - 12, 0, 0, by - 18, fh);
    fg.addColorStop(0, 'rgba(255,250,230,1)');
    fg.addColorStop(0.3, 'rgba(255,214,140,0.95)');
    fg.addColorStop(0.7, 'rgba(240,130,50,0.5)');
    fg.addColorStop(1, 'rgba(200,80,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(sway, by - fh);
    ctx.bezierCurveTo(fw * 0.9 + sway * 0.5, by - fh * 0.55, fw * 1.25, by - 4, 0, by + 4);
    ctx.bezierCurveTo(-fw * 1.25, by - 4, -fw * 0.9 + sway * 0.5, by - fh * 0.55, sway, by - fh);
    ctx.fill();
    ctx.restore();
  }
  // الشرارة
  const sp = 1 - ramp(t, T.spark, T.spark + 0.45);
  if (t >= T.spark && sp > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 30 + 160 * (1 - sp);
    const g = ctx.createRadialGradient(0, -110, 0, 0, -110, r);
    g.addColorStop(0, `rgba(255,240,200,${0.9 * sp})`); g.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = g; ctx.fillRect(-r, -110 - r, 2 * r, 2 * r);
    ctx.restore();
  }
}

function decorAlpha(sAt, ps, span = 260) { return clamp((ps - sAt) / span); }

function drawDecor(t, ps, z, fadeAll) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const dim = (a) => `rgba(214,174,108,${0.38 * a * fadeAll})`;
  // صفحات الكتاب: الحافة السفلية وأسطر النص
  const aB = decorAlpha(MAIN.anchors['bookStart'] + 900, ps, 400);
  if (aB > 0) {
    ctx.strokeStyle = dim(aB); ctx.lineWidth = 1.6 / z;
    ctx.beginPath();
    ctx.moveTo(-590, -8); ctx.quadraticCurveTo(-700, -30, -820, -12);
    ctx.quadraticCurveTo(-940, -30, -1050, -8); ctx.stroke();
    ctx.lineWidth = 1.2 / z;
    for (let i = 0; i < 6; i++) {
      const y = -150 + i * 22, a = clamp(aB * 1.6 - i * 0.12);
      ctx.strokeStyle = dim(a * 0.8);
      ctx.beginPath(); ctx.moveTo(-612, y + 4); ctx.quadraticCurveTo(-705, y - 12, -800, y + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-840, y + 6); ctx.quadraticCurveTo(-935, y - 12, -1028, y + 4); ctx.stroke();
    }
  }
  // أشرطة على كعوب الكتب
  let x = -1180;
  SPINES.forEach(([w, h], i) => {
    const a = decorAlpha(MAIN.anchors['spinesStart'] + (i + 1) * 300, ps, 300);
    if (a > 0) {
      ctx.strokeStyle = dim(a); ctx.lineWidth = 1.4 / z;
      for (const yy of [-h + 26, -h + 34, -30]) { ctx.beginPath(); ctx.moveTo(x - 7, yy); ctx.lineTo(x - w + 7, yy); ctx.stroke(); }
      if (i % 2 === 0) { ctx.beginPath(); ctx.arc(x - w / 2, -h / 2 - 10, 6, 0, Math.PI * 2); ctx.stroke(); }
    }
    x -= w;
  });
  // محتوى الشاشة: درس
  const aS = decorAlpha(MAIN.anchors['screenEnd'] - 40, ps, 200) * (0.6 + 0.4 * sramp(t, 8.2, 9.2));
  if (aS > 0) {
    ctx.strokeStyle = dim(aS); ctx.lineWidth = 1.6 / z;
    ctx.beginPath(); ctx.moveTo(-1600, -40); ctx.lineTo(-1960, -40); ctx.stroke();
    // زر تشغيل داخل دائرة
    ctx.beginPath(); ctx.arc(-1880, -150, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,220,160,${0.5 * aS * fadeAll})`;
    ctx.beginPath(); ctx.moveTo(-1868, -150); ctx.lineTo(-1892, -164); ctx.lineTo(-1892, -136); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = clamp(aS * 2 - i * 0.25);
      ctx.strokeStyle = dim(a);
      ctx.beginPath(); ctx.moveTo(-1640, -200 + i * 30); ctx.lineTo(-1640 - [150, 120, 160, 90][i], -200 + i * 30); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCrossFill(t, z) {
  const k = sramp(t, T.crossDone - 0.1, T.crossDone + 0.9);
  if (k <= 0) return;
  const loop = WORLD.loop;
  const { x: cx, y: cy, S } = CROSS;
  ctx.save();
  // ملء ذهبي
  ctx.beginPath(); loop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 250 * S);
  g.addColorStop(0, `rgba(255,214,140,${0.55 * k})`);
  g.addColorStop(0.6, `rgba(196,128,52,${0.36 * k})`);
  g.addColorStop(1, `rgba(120,64,24,${0.28 * k})`);
  ctx.fillStyle = g; ctx.fill();
  // إطار داخلي أحمر قبطي يتبع حافة الصليب
  ctx.save();
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(142,42,31,${0.9 * k})`; ctx.lineWidth = 22; ctx.stroke();
  ctx.strokeStyle = g; ctx.lineWidth = 15; ctx.stroke();
  ctx.restore();
  // مركز
  ctx.beginPath(); ctx.arc(cx, cy, 16 * S, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,236,196,${0.85 * k})`; ctx.fill();
  ctx.strokeStyle = `rgba(142,42,31,${0.9 * k})`; ctx.stroke();
  ctx.restore();
  // هالة تتسع عند الاكتمال
  const h = ramp(t, T.crossDone, T.crossDone + 1.6);
  if (h > 0 && h < 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(cx, cy, 250 * S + 260 * easeOut(h), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,210,140,${0.5 * (1 - h)})`; ctx.lineWidth = (2 + 8 * (1 - h)) / z; ctx.stroke();
    ctx.restore();
  }
  // دائرة ثابتة رفيعة حول الصليب
  const ringA = sramp(t, T.crossDone + 0.3, T.crossDone + 1.6);
  if (ringA > 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 262 * S, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringA);
    ctx.strokeStyle = `rgba(214,174,108,${0.45 * ringA})`; ctx.lineWidth = 1.5 / z; ctx.stroke();
    ctx.restore();
  }
}

function drawPen(c, ps, t, color = [255, 240, 210], strength = 1) {
  const [x, y] = MAIN.pointAt(ps);
  const [sx, sy] = toScreen(c, x, y);
  drawSpark(sx, sy, t, color, strength);
}

function drawSpark(sx, sy, t, color, strength) {
  if (strength <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.15 * Math.sin(t * 17);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 46 * pulse);
  g.addColorStop(0, rgba(color, 0.95 * strength)); g.addColorStop(0.18, rgba([255, 200, 120], 0.45 * strength)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(sx - 60, sy - 60, 120, 120);
  ctx.fillStyle = rgba([255, 255, 245], strength);
  ctx.beginPath(); ctx.arc(sx, sy, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBackground(t, c, ps) {
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
  const on = sramp(t, T.spark, T.spark + 1.2);
  // ضوء دافئ يتبع القلم (كأن النور ينير الطريق)
  const [px, py] = MAIN.pointAt(ps);
  const [sx, sy] = toScreen(c, px, py);
  const lightA = on * (1 - 0.6 * sramp(t, 22.0, 24.0));
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 900);
  g.addColorStop(0, `rgba(110,62,26,${0.30 * lightA})`);
  g.addColorStop(0.5, `rgba(60,32,14,${0.16 * lightA})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // توهج الصليب في النهاية
  const ce = sramp(t, T.crossDone - 0.3, T.crossDone + 1.5);
  if (ce > 0) {
    const [cx, cy] = toScreen(c, CROSS.x, CROSS.y);
    const r = 760 * c.z;
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g2.addColorStop(0, `rgba(130,70,28,${0.36 * ce})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }
}

function drawParticles(t, c) {
  const on = sramp(t, 0.9, 3.0);
  if (on <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const span = W * 1.3;
  for (const p of particles) {
    let x = (p.u * span - c.x * c.z * p.depth) % span; if (x < 0) x += span; x -= W * 0.15;
    let y = (p.v * (H + 100) - t * p.speed - c.y * c.z * p.depth * 0.5) % (H + 100); if (y < 0) y += H + 100; y -= 50;
    x += Math.sin(t * 0.6 + p.ph) * 14;
    const a = on * p.a * (0.10 + 0.08 * Math.sin(t * 1.3 + p.ph));
    ctx.fillStyle = `rgba(255,214,160,${a})`;
    ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawOverlay(t, frame) {
  // تعتيم الأطراف
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // حبيبات
  ctx.save();
  ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
  const tile = grainTiles[frame % 3];
  const pat = ctx.createPattern(tile, 'repeat');
  const ox = (frame * 73) % 256, oy = (frame * 151) % 256;
  ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
  // ظلام في البداية والنهاية
  const black = sramp(t, ...T.fadeOut);
  if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${black})`; ctx.fillRect(0, 0, W, H); }
}

// ───────────────────────── الإطار
export function renderFrame(t) {
  const frame = Math.round(t * FPS);
  const c = camera(t);
  const ps = penS(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  drawBackground(t, c, ps);
  drawParticles(t, c);

  // عالم
  ctx.setTransform(c.z, 0, 0, c.z, W / 2 - c.x * c.z, H / 2 - c.y * c.z);
  const endFade = 1 - 0.96 * sramp(t, 24.3, 25.5); // في البطاقة الختامية يبقى الصليب وحده تقريبًا
  const worldTextA = 1 - sramp(t, 22.0, 22.7);
  drawCandle(t, c);
  drawDecor(t, ps, c.z, endFade);

  const crossS = MAIN.anchors['crossStart'];
  drawThread(MAIN, 0, Math.min(ps, crossS), c.z, COLORS.ink, COLORS.glow, endFade);
  if (ps > crossS) drawThread(MAIN, crossS, ps, c.z, COLORS.ink, COLORS.glow, 1);
  // ذيل ساخن خلف القلم
  if (t < T.crossDone + 0.6) {
    const hot = 1 - sramp(t, T.crossDone, T.crossDone + 0.6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 4; k++) strokeRange(MAIN, ps - 420 + k * 105, ps, 3.4, `rgba(255,214,150,${0.14 * hot})`, c.z);
    ctx.restore();
  }

  // الخيط الثاني (القادم الجديد) والضفيرة
  const S2 = WORLD.strand;
  let s2 = 0;
  if (t >= T.strand[0]) {
    if (t < T.strand[1]) s2 = S2.anchors['braidStart'] * easeInOut(ramp(t, ...T.strand));
    else s2 = S2.anchors['braidStart'] + clamp(ps - MAIN.anchors['braidStart'], 0, S2.total - S2.anchors['braidStart']);
  }
  const dotA = sramp(t, 8.5, 9.1) * endFade;
  if (dotA > 0) {
    const [dx, dy] = S2.pts[0];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, 60);
    g.addColorStop(0, `rgba(250,244,230,${0.9 * dotA})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(dx - 60, dy - 60, 120, 120);
    ctx.restore();
  }
  drawThread(S2, 0, s2, c.z, COLORS.ivory, [200, 190, 170], endFade);
  // تقاطعات فوق/تحت (تضفير قبطي)
  const [penX] = MAIN.pointAt(ps);
  for (let k = 1; k <= 7; k++) {
    const xk = BRAID.x0 - (k * BRAID.P) / 2;
    if (penX > xk - 22 || s2 <= S2.anchors['braidStart']) continue;
    const over = k % 2 ? S2 : MAIN;
    const sa = arcLenAtX(over, xk + 20), sb = arcLenAtX(over, xk - 20);
    ctx.save(); ctx.lineCap = 'round';
    strokeRange(over, sa, sb, 12, COLORS.bg, c.z);
    ctx.restore();
    drawThread(over, sa, sb, c.z, over === S2 ? COLORS.ivory : COLORS.ink, over === S2 ? [200, 190, 170] : COLORS.glow, endFade);
  }

  drawCrossFill(t, c.z);

  // نبضة ضوء تعبر الخيط كله أثناء الابتعاد
  const pu = ramp(t, 22.5, 24.3);
  if (pu > 0 && pu < 1) {
    const sp = easeInOut(pu) * (MAIN.total + 600);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const env = Math.sin(Math.PI * pu);
    for (let k = 0; k < 6; k++) strokeRange(MAIN, sp - 700 + k * 120, Math.min(sp, MAIN.total), 3 + k * 0.8, `rgba(255,236,190,${0.16 * env})`, c.z);
    ctx.restore();
  }

  // عناوين في العالم (تُكتب من اليمين)
  const titleFont = '700 80px "Aref Ruqaa"', capFont = '400 30px "Noto Kufi Arabic"';
  const cream = 'rgba(243,231,208,ALPHA)', gold = 'rgba(214,174,108,ALPHA)';
  const titles = [
    [TEXT.t1, -330, 205, 1.3, 2.4, 4.1, 4.8, null],
    [TEXT.t2, -1310, 205, 4.6, 5.7, 8.6, 9.3, TEXT.c2],
    [TEXT.t3, -2760, 205, 10.2, 11.3, 13.6, 14.3, TEXT.c3],
    [TEXT.t4, -3880, 205, 14.0, 15.1, 17.0, 17.6, TEXT.c4],
    [TEXT.t5, CROSS.x, 150, 19.4, 20.6, 22.0, 22.7, null],
  ];
  for (const [txt, x, y, i0, i1, o0, o1, cap] of titles) {
    const a = (1 - sramp(t, o0, o1)) * worldTextA;
    revealText(txt, titleFont, cream, x, y - 8 * (1 - sramp(t, i0, i1)), ramp(t, i0, i1), a);
    if (cap) revealText(cap, capFont, gold, x, y + 74, ramp(t, i0 + 0.6, i1 + 0.6), a * 0.95);
  }

  // القلم
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const penA = sramp(t, 1.7, 2.1) * (1 - sramp(t, T.crossDone, T.crossDone + 0.5));
  drawPen(c, ps, t, [255, 240, 210], penA);
  if (s2 > 0 && s2 < S2.total && t < 13.2) {
    const [x2, y2] = S2.pointAt(s2);
    const [sx2, sy2] = toScreen(c, x2, y2);
    drawSpark(sx2, sy2, t + 1, [250, 246, 236], 0.85 * (t < T.strand[1] + 0.2 ? 1 : 0.6));
  }

  drawEndCard(t);
  drawOverlay(t, frame);
}

function drawEndCard(t) {
  if (t < 24.8) return;
  const cream = 'rgba(243,231,208,ALPHA)', gold = 'rgba(214,174,108,ALPHA)';
  if (TEXT.coptic) {
    ctx.save();
    ctx.font = '400 26px "Noto Sans Coptic"'; ctx.textAlign = 'center'; ctx.letterSpacing = '10px';
    ctx.fillStyle = `rgba(214,174,108,${0.75 * sramp(t, 25.0, 25.9)})`;
    ctx.fillText(TEXT.coptic, W / 2 + 5, 618);
    ctx.restore();
  }
  revealText(TEXT.name, '700 92px "Aref Ruqaa"', cream, W / 2, 728, easeInOut(ramp(t, 25.2, 26.3)), 1, 1.2);
  // خط فاصل رفيع يُرسم من اليمين
  const ln = easeInOut(ramp(t, 25.8, 26.6));
  if (ln > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(214,174,108,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(W / 2 + 170, 776); ctx.lineTo(W / 2 + 170 - 340 * ln, 776); ctx.stroke();
    ctx.restore();
  }
  revealText(TEXT.tagline, '400 30px "Noto Kufi Arabic"', gold, W / 2, 830, easeInOut(ramp(t, 25.9, 26.7)), 1);
  revealText(TEXT.verse, '400 38px "Amiri"', cream, W / 2, 928, easeInOut(ramp(t, 26.5, 27.9)), 0.9);
  revealText(TEXT.ref, '400 24px "Noto Kufi Arabic"', gold, W / 2, 978, easeInOut(ramp(t, 27.5, 28.1)), 0.85);
}

// بيانات للصوت (تتزامن مع الصورة)
export function timeline() {
  const pen = [];
  for (let f = 0; f <= DURATION * FPS; f++) {
    const t = f / FPS;
    const z = camera(t).z;
    const v = (penS(t + 0.5 / FPS) - penS(t - 0.5 / FPS)) * FPS * z; // سرعة القلم على الشاشة px/s
    pen.push(t >= 2.0 && t <= T.crossDone ? Math.round(v) : 0);
  }
  const anchorTimes = Object.fromEntries(ANCHORS.map(a => [a.n, a.t]));
  return {
    fps: FPS, duration: DURATION, spark: T.spark, strand: T.strand, crossDone: T.crossDone,
    overview: T.overview, endcard: T.endcard, fadeOut: T.fadeOut,
    beats: ['R1', 'R2', 'R3'].map(n => +timeOfS(MAIN.anchors[n]).toFixed(4)),
    anchors: anchorTimes, penSpeed: pen,
  };
}

// يحسب طول القوس عند أول وصول للمسار إلى إحداثي x (للمقاطع المتجهة يسارًا)
function arcLenAtX(path, x) {
  for (let i = 1; i < path.pts.length; i++) {
    if (path.pts[i][0] <= x && path.pts[i - 1][0] > x && path.pts[i][0] < BRAID.x0 + 1) {
      const f = (path.pts[i - 1][0] - x) / (path.pts[i - 1][0] - path.pts[i][0]);
      return lerp(path.len[i - 1], path.len[i], f);
    }
  }
  return 0;
}
