#!/usr/bin/env node
// Renders the iPhone 6.9" App Store screenshots (1320×2868, opaque JPEG) from
// raw simulator captures: a cream paper field, a serif headline whose second
// line carries the search phrase, and the capture in a device frame.
//
//   node scripts/store/render-store-screenshots.mjs <raw-captures-dir> <out-dir>
//
// The raw directory must hold one PNG per entry in SHOTS below, captured from
// the release simulator build with the status bar overridden to 9:41. Chrome
// renders the HTML; sips flattens it to JPEG so no alpha channel reaches Apple.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1320;
const HEIGHT = 2868;

/** [capture file stem, headline, accent line, supporting line] */
const SHOTS = [
  ['organic-mid', 'Turn any photo', 'into a jigsaw.', 'Calm, tactile puzzles. No ads, ever.'],
  ['setup-living', 'Cuts you won’t', 'find anywhere else.', 'Organic, Living, Crystal and Amoeba shapes.'],
  ['home-first', 'No ads.', 'No subscription.', 'No account. Every size is free.'],
  ['gallery', 'Your photos,', 'or ours.', 'Curated themes, plus a set that plays offline.'],
  ['setup-sizes', '9 to 196 pieces.', 'All of them free.', 'Pick whatever feels comfortable today.'],
  ['complete', 'Piece by piece.', 'Picture complete.', 'Finished pictures wait in your album.'],
];

const [rawArg, outArg] = process.argv.slice(2);
if (!rawArg || !outArg) {
  console.error('Usage: render-store-screenshots.mjs <raw-captures-dir> <out-dir>');
  process.exit(2);
}
const rawDir = resolve(rawArg);
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });

SHOTS.forEach(([stem, headline, accent, support], index) => {
  const capture = `${rawDir}/${stem}.png`;
  if (!existsSync(capture)) throw new Error(`Missing capture ${capture}`);
  const number = String(index + 1).padStart(2, '0');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
  body{background:radial-gradient(120% 70% at 20% 0%,#f7f1e6 0%,#efe6d6 55%,#e6dac6 100%);font-family:-apple-system,"SF Pro Text",Helvetica,sans-serif;position:relative}
  .top{position:absolute;left:110px;right:110px;top:120px;display:flex;justify-content:space-between;color:#6f6554;font-size:34px;letter-spacing:14px;font-weight:600}
  .top span:last-child{letter-spacing:3px;font-weight:500}
  h1{position:absolute;left:104px;right:80px;top:210px;margin:0;font-family:"Iowan Old Style","New York",Georgia,serif;font-weight:500;font-size:136px;line-height:1.02;letter-spacing:-2px;color:#221d16}
  h1 em{font-style:normal;color:#6b7a5a;display:block}
  p{position:absolute;left:110px;right:110px;top:530px;margin:0;font-size:50px;line-height:1.3;color:#4d4538}
  .device{position:absolute;left:50%;transform:translateX(-50%);top:720px;width:1030px;height:2239px;border-radius:150px;background:#1b1814;padding:22px;box-shadow:0 60px 120px rgba(60,40,15,.28),0 0 0 3px #c9bca5}
  .device img{display:block;width:100%;height:100%;border-radius:128px;object-fit:cover}
  </style></head><body>
  <div class="top"><span>FRUME</span><span>${number} / ${String(SHOTS.length).padStart(2, '0')}</span></div>
  <h1>${headline}<em>${accent}</em></h1><p>${support}</p>
  <div class="device"><img src="file://${capture}"></div></body></html>`;
  const htmlPath = `${outDir}/${number}.html`;
  const pngPath = `${outDir}/${number}.png`;
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', `--screenshot=${pngPath}`, `--window-size=${WIDTH},${HEIGHT}`, `file://${htmlPath}`], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', pngPath, '--out', `${outDir}/${number}.jpg`], { stdio: 'ignore' });
  console.log(`${outDir}/${number}.jpg`);
});
