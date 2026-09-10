#!/usr/bin/env node
/**
 * Render the course "coming soon" placeholder clip.
 *
 * Composition: scripts/placeholder-video/coming-soon.html (every movement is a
 * function of time, so frames are captured deterministically by stepping
 * window.seek(t) and screenshotting). Output goes to
 * scripts/placeholder-video/out/ (git-ignored):
 *
 *   coming-soon.mp4          1920x1080, 30 fps, H.264, no audio track
 *   coming-soon.vtt          captions for the on-screen text (upload to Stream as "en")
 *   coming-soon-poster.png   the frame at 2 s, for a poster if one is ever needed
 *
 * Needs Google Chrome installed, plus two packages that are deliberately NOT in
 * package.json (ffmpeg-static downloads an 80 MB binary, and nothing in the
 * build needs it):
 *
 *   npm i --no-save playwright-core ffmpeg-static
 *   node scripts/render-placeholder-video.mjs
 *
 * Options:
 *   --tools <dir>   directory whose node_modules holds playwright-core and
 *                   ffmpeg-static (default: the repo root)
 *   --out <dir>     output directory (default: scripts/placeholder-video/out)
 *   --fps <n>       frame rate (default 30)
 *   --keep-frames   leave the PNG frames on disk after encoding
 *   --serve         only start the preview server and print its URL (Ctrl+C to stop)
 *
 * Upload the MP4 to Cloudflare Stream with "Require signed URLs" on, add the VTT
 * as the English caption track, and put the returned UID in every lesson file
 * that carries `videoPlaceholder: true`.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(name);

const toolsDir = resolve(opt('--tools', REPO));
const outDir = resolve(opt('--out', join(REPO, 'scripts', 'placeholder-video', 'out')));
const fps = Number(opt('--fps', '30'));
const keepFrames = flag('--keep-frames');
const serveOnly = flag('--serve');
const PAGE = '/scripts/placeholder-video/coming-soon.html';

const requireTools = createRequire(join(toolsDir, 'package.json'));
let chromium;
let ffmpegPath;
try {
  ({ chromium } = requireTools('playwright-core'));
  ffmpegPath = requireTools('ffmpeg-static');
} catch (err) {
  console.error(
    `Could not load playwright-core and ffmpeg-static from ${toolsDir}.\n` +
      `Run: npm i --no-save playwright-core ffmpeg-static   (or pass --tools <dir>)\n${err.message}`
  );
  process.exit(1);
}

// A tiny static server for the repo root, so the page can load the brand
// fonts and SVGs over http (Chrome refuses cross-file font and fetch loads).
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.css': 'text/css',
  '.js': 'text/javascript',
};
function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = normalize(join(REPO, decodeURIComponent(url.pathname)));
    if (!file.startsWith(REPO + sep) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function pad(n) {
  return String(n).padStart(5, '0');
}

function vttTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const f = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
}

function run(cmd, cmdArgs) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited with ${code}`))));
  });
}

const server = await startServer();
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`Preview: ${origin}${PAGE}`);

if (serveOnly) {
  console.log('Serving. Press Ctrl+C to stop.');
  await new Promise(() => {});
}

const framesDir = join(outDir, 'frames');
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => {
    throw err;
  });
  await page.goto(origin + PAGE, { waitUntil: 'load' });
  await page.evaluate(() => window.READY);

  const fontsOk = await page.evaluate(() =>
    ['500 20px Poppins', '700 20px Poppins', '400 20px Anton'].every((f) => document.fonts.check(f))
  );
  if (!fontsOk) throw new Error('Brand fonts did not load; check src/assets/fonts');

  const duration = await page.evaluate(() => window.DURATION);
  const cues = await page.evaluate(() => window.CUES);
  const total = Math.round(duration * fps);
  console.log(`Rendering ${total} frames at ${fps} fps (${duration} s)`);

  const started = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.seek(t), i / fps);
    await page.screenshot({ path: join(framesDir, `${pad(i)}.png`), type: 'png', animations: 'disabled', caret: 'hide' });
    if (i % (fps * 4) === 0) process.stdout.write(`  frame ${i}/${total}\r`);
  }
  console.log(`  captured ${total} frames in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  const mp4 = join(outDir, 'coming-soon.mp4');
  await run(ffmpegPath, [
    '-y', '-loglevel', 'error', '-stats',
    '-framerate', String(fps), '-i', join(framesDir, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-r', String(fps),
    mp4,
  ]);

  const vtt = ['WEBVTT', '', ...cues.flatMap((c, i) => [`${i + 1}`, `${vttTime(c.start)} --> ${vttTime(c.end)}`, c.text, ''])].join('\n');
  writeFileSync(join(outDir, 'coming-soon.vtt'), vtt);
  copyFileSync(join(framesDir, `${pad(Math.min(total - 1, Math.round(2 * fps)))}.png`), join(outDir, 'coming-soon-poster.png'));

  if (!keepFrames) rmSync(framesDir, { recursive: true, force: true });
  console.log(`\nWrote ${mp4} (${(statSync(mp4).size / 1024 / 1024).toFixed(2)} MB), coming-soon.vtt, coming-soon-poster.png`);
} finally {
  await browser.close();
  server.close();
}
