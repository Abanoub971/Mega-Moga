// يصدّر الفيلم إطارًا بإطار عبر Chromium ثم يرسله إلى ffmpeg.
// الاستخدام:
//   node scripts/render.mjs                 → build/video.mp4 (بدون صوت) + build/timeline.json
//   node scripts/render.mjs --stills 1,5,12 → صور PNG للمراجعة في build/stills
//   node scripts/render.mjs --timeline      → build/timeline.json فقط
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
fs.mkdirSync(BUILD, { recursive: true });
const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

const launchOpts = {};
if (fs.existsSync('/opt/pw-browsers/chromium')) {
  // بيئات فيها نسخة Chromium مثبتة مسبقًا
  const dir = fs.readdirSync('/opt/pw-browsers').find(d => /^chromium-\d+$/.test(d));
  if (dir) launchOpts.executablePath = path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
  if (launchOpts.executablePath && !fs.existsSync(launchOpts.executablePath)) delete launchOpts.executablePath;
}

const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/src/index.html?render=1`;
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('page error:', e); process.exit(1); });
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.filmReady === true, null, { timeout: 30000 });

const tl = await page.evaluate(() => window.getTimeline());
fs.writeFileSync(path.join(BUILD, 'timeline.json'), JSON.stringify(tl));
console.log('timeline: beats', tl.beats);

const canvas = await page.$('canvas');
async function grab(t) {
  await page.evaluate(t => window.renderFrame(t), t);
  return canvas.screenshot({ type: 'png' });
}

if (args.includes('--timeline')) {
  // لا شيء آخر
} else if (stillsArg) {
  const dir = path.join(BUILD, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of stillsArg.split(',')) {
    const t = parseFloat(s);
    fs.writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`), await grab(t));
  }
  console.log('stills →', dir);
} else {
  const { fps, duration } = tl;
  const total = Math.round(fps * duration);
  const out = path.join(BUILD, 'video.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'grain', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const buf = await grab(f / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  console.log(`\nvideo → ${out}`);
}
await browser.close();
server.close();
