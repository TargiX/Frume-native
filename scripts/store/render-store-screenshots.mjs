#!/usr/bin/env node
// Renders the iPhone 6.9" App Store screenshots (1320×2868, opaque JPEG).
//
//   node scripts/store/render-store-screenshots.mjs <raw-captures-dir> <out-dir>
//
// Warm dark table, serif headline with a gold accent line, the capture in a
// large device frame, and real jigsaw pieces cut from the same photograph
// breaking out of the screen. The cut-styles slide fans cropped setup
// previews instead of a device.
//
// App Store Review Guideline 2.3.7: no prices, "free", discounts or
// subscription terms anywhere in the artwork or the captures.
//
// The raw directory must hold the captures named in SHOTS / CUT_CARDS (from the
// release simulator build, status bar at 9:41). Chrome renders the HTML; sips
// flattens it to JPEG so no alpha channel reaches Apple.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1320;
const HEIGHT = 2868;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PHOTOS = {
  coastal: `${REPO}/assets/discover/coastal-morning.png`,
  fjord: `${REPO}/assets/bundled/blue-fjord.jpg`,
  falls: `${REPO}/assets/bundled/canyon-falls.jpg`,
};

/**
 * capture: raw PNG stem, or null for the cut-card slide.
 * pieces: [photo, x, y, size, rotation°, photo offset x/y as 0..1]
 */
const SHOTS = [
  {
    capture: 'game-organic',
    headline: ['Your photo,', 'your puzzle.'],
    support: 'Calm, tactile jigsaws. No ads, ever.',
    pieces: [
      ['coastal', -40, 1180, 330, -14, 0.08, 0.1],
      ['coastal', 1010, 1520, 300, 12, 0.62, 0.34],
      ['coastal', 60, 2320, 280, 8, 0.3, 0.72],
    ],
  },
  {
    capture: null,
    headline: ['Cuts that', 'feel alive.'],
    support: 'Living, Crystal, Organic, Amoeba and more.',
  },
  {
    capture: 'gallery',
    headline: ['Your photos,', 'or ours.'],
    support: 'Curated themes, plus a collection that works offline.',
    pieces: [['falls', 1000, 1300, 280, 10, 0.4, 0.3]],
  },
  {
    capture: 'game-49-mid',
    headline: ['Take your time.', 'Piece by piece.'],
    support: 'From 9 to 196 pieces. Pinch in to look closer.',
    pieces: [
      ['fjord', -30, 1500, 250, -10, 0.55, 0.45],
      ['fjord', 1040, 2050, 240, 14, 0.2, 0.7],
    ],
  },
  {
    capture: 'album',
    headline: ['A shelf for', 'every picture.'],
    support: 'Unfinished puzzles wait on your shelf.',
  },
  {
    capture: 'complete-49',
    headline: ['No ads.', 'Just the picture.'],
    support: 'No account. No timer to beat. Nothing in the way.',
  },
];

const CUT_CARDS = [
  ['crop-living', 'Living', -4, 60, 780],
  ['crop-crystal', 'Crystal', 3, 200, 1300],
  ['crop-organic', 'Organic', -3, 60, 1820],
  ['crop-amoeba', 'Amoeba', 4, 200, 2340],
];

const url = (path) => pathToFileURL(path).href.replaceAll('"', '%22');

/** One jigsaw edge in unit space; y < 0 is outward for tab = 1. */
const TAB = [
  [0.36, 0],
  ['C', 0.4, 0, 0.42, -0.04, 0.4, -0.08],
  ['C', 0.36, -0.17, 0.44, -0.24, 0.5, -0.24],
  ['C', 0.56, -0.24, 0.64, -0.17, 0.6, -0.08],
  ['C', 0.58, -0.04, 0.6, 0, 0.64, 0],
  [1, 0],
];

function piecePath(size, tabs, pad) {
  const corners = [
    [pad, pad],
    [pad + size, pad],
    [pad + size, pad + size],
    [pad, pad + size],
  ];
  let d = `M ${corners[0][0]} ${corners[0][1]}`;
  for (let edge = 0; edge < 4; edge += 1) {
    const [x0, y0] = corners[edge];
    const [x1, y1] = corners[(edge + 1) % 4];
    const ux = (x1 - x0) / size;
    const uy = (y1 - y0) / size;
    // Outward normal of a clockwise edge.
    const nx = uy;
    const ny = -ux;
    const map = (t, n) => {
      const out = -n * tabs[edge];
      return `${(x0 + (ux * t + nx * out) * size).toFixed(1)} ${(y0 + (uy * t + ny * out) * size).toFixed(1)}`;
    };
    for (const step of TAB) {
      if (step[0] === 'C') {
        d += ` C ${map(step[1], step[2])} ${map(step[3], step[4])} ${map(step[5], step[6])}`;
      } else if (tabs[edge] === 0 && step[0] !== 1) {
        continue;
      } else {
        d += ` L ${map(step[0], step[1])}`;
      }
    }
  }
  return `${d} Z`;
}

function flyingPiece([photo, x, y, size, rotation, ox, oy], index) {
  const pad = size * 0.26;
  const box = size + pad * 2;
  const imageWidth = size * 5;
  const tabs = [1, -1, 1, 1].map((tab, edge) => ((edge + index) % 3 === 0 ? -tab : tab));
  const path = piecePath(size, tabs, pad);
  return `<svg class="piece" style="left:${x}px;top:${y}px;transform:rotate(${rotation}deg)" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">
    <defs>
      <pattern id="p${index}" patternUnits="userSpaceOnUse" x="${-ox * imageWidth + pad}" y="${-oy * imageWidth * 0.75 + pad}" width="${imageWidth}" height="${imageWidth * 1.4}">
        <image href="${url(PHOTOS[photo])}" width="${imageWidth}" height="${imageWidth * 1.4}" preserveAspectRatio="xMidYMid slice"/>
      </pattern>
      <linearGradient id="g${index}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.22"/>
      </linearGradient>
    </defs>
    <path d="${path}" fill="url(#p${index})"/>
    <path d="${path}" fill="url(#g${index})"/>
    <path d="${path}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2.5"/>
  </svg>`;
}

const STYLE = `
  html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
  body{position:relative;font-family:-apple-system,"SF Pro Text",Helvetica,sans-serif;
    background:
      radial-gradient(80% 45% at 50% 62%, rgba(216,162,74,0.20), rgba(216,162,74,0) 70%),
      radial-gradient(70% 30% at 15% 0%, rgba(255,236,200,0.10), rgba(0,0,0,0) 70%),
      linear-gradient(180deg,#221c16 0%,#15110d 55%,#0e0b09 100%)}
  .grain{position:absolute;inset:0;opacity:0.10;mix-blend-mode:overlay}
  .mark{position:absolute;left:110px;top:130px;color:#d8a24a;font-size:32px;font-weight:700;letter-spacing:16px}
  h1{position:absolute;left:104px;right:80px;top:210px;margin:0;white-space:nowrap;font-family:"Iowan Old Style","New York",Georgia,serif;
     font-weight:600;font-size:150px;line-height:1.0;letter-spacing:-3px;color:#f7f0e4}
  h1 span,h1 em{display:block;font-style:normal}
  h1 em{color:#e2b45f}
  p{position:absolute;left:110px;right:110px;top:560px;margin:0;font-size:52px;line-height:1.28;color:rgba(247,240,228,0.74)}
  .device{position:absolute;left:50%;top:790px;width:1000px;height:2174px;transform:translateX(-50%);
    border-radius:150px;background:#0b0a09;padding:20px;
    box-shadow:0 0 0 3px rgba(255,255,255,0.10),0 90px 180px rgba(0,0,0,0.65),0 0 120px rgba(216,162,74,0.10)}
  .device img{display:block;width:100%;height:100%;border-radius:130px;object-fit:cover}
  .piece{position:absolute;overflow:visible;filter:drop-shadow(0 34px 44px rgba(0,0,0,0.6)) drop-shadow(0 6px 10px rgba(0,0,0,0.4))}
  .card{position:absolute;width:1060px;border-radius:44px;overflow:hidden;
    box-shadow:0 0 0 4px rgba(247,240,228,0.9),0 60px 120px rgba(0,0,0,0.6)}
  .card img{display:block;width:100%}
  .card span{position:absolute;left:34px;top:30px;padding:14px 28px;border-radius:999px;background:rgba(14,11,9,0.78);
    color:#e2b45f;font-size:38px;font-weight:700;letter-spacing:6px;text-transform:uppercase}
`;

const GRAIN = `<svg class="grain" width="${WIDTH}" height="${HEIGHT}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

const [rawArg, outArg] = process.argv.slice(2);
if (!rawArg || !outArg) {
  console.error('Usage: render-store-screenshots.mjs <raw-captures-dir> <out-dir>');
  process.exit(2);
}
const rawDir = resolve(rawArg);
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });

function requireCapture(stem) {
  const path = `${rawDir}/${stem}.png`;
  if (!existsSync(path)) throw new Error(`Missing capture ${path}`);
  return path;
}

SHOTS.forEach((shot, index) => {
  const number = String(index + 1).padStart(2, '0');
  const body = shot.capture
    ? `<div class="device"><img src="${url(requireCapture(shot.capture))}"></div>${(shot.pieces ?? []).map((piece, i) => flyingPiece(piece, index * 10 + i)).join('')}`
    : CUT_CARDS.map(
        ([stem, label, rotation, left, top]) =>
          `<div class="card" style="left:${left}px;top:${top}px;transform:rotate(${rotation}deg)"><img src="${url(requireCapture(stem))}"><span>${label}</span></div>`,
      ).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
    ${GRAIN}<div class="mark">FRUME</div>
    <h1><span>${shot.headline[0]}</span><em>${shot.headline[1]}</em></h1><p>${shot.support}</p>
    <script>
      // Two lines, always: shrink the headline until the longer line fits.
      const h = document.querySelector('h1');
      let size = 150;
      while (size > 90 && [...h.children].some((line) => line.scrollWidth > h.clientWidth)) {
        size -= 2;
        h.style.fontSize = size + 'px';
      }
    </script>
    ${body}</body></html>`;
  const htmlPath = `${outDir}/${number}.html`;
  const pngPath = `${outDir}/${number}.png`;
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', `--screenshot=${pngPath}`, `--window-size=${WIDTH},${HEIGHT}`, pathToFileURL(htmlPath).href], { stdio: 'ignore', timeout: 60_000 });
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', pngPath, '--out', `${outDir}/${number}.jpg`], { stdio: 'ignore' });
  console.log(`${outDir}/${number}.jpg`);
});
