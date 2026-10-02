#!/usr/bin/env node
/**
 * Génère les icônes PWA « placeholder » de Mimo (PNG + SVG) sans aucune dépendance :
 * le visage est décrit par des formes simples rasterisées avec anticrénelage.
 * Usage : pnpm --filter @mimo/web icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const TOP = hex('#9b7dff');
const BOTTOM = hex('#6a48f0');
const BODY = hex('#fff8f0');
const INK = hex('#2d2a3e');
const CHEEK = hex('#ff9ab8');

/** Couleur (RGBA) d'un point en coordonnées normalisées [0,1], ou null si transparent. */
function sample(x, y, { maskable }) {
  const r = maskable ? 0 : 0.22; // coins arrondis (pas pour l'icône maskable, plein cadre)
  const inset = 0;
  const cx = Math.min(Math.max(x, r + inset), 1 - r - inset);
  const cy = Math.min(Math.max(y, r + inset), 1 - r - inset);
  if (r > 0 && (x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;

  // Le visage est réduit pour l'icône maskable (zone de sécurité de 80 %).
  const s = maskable ? 0.78 : 1;
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  const inEllipse = (ex, ey, rx, ry) => ((u - ex) / rx) ** 2 + ((v - ey) / ry) ** 2 <= 1;

  if (inEllipse(0.4, 0.5, 0.05, 0.065) || inEllipse(0.6, 0.5, 0.05, 0.065)) {
    if (inEllipse(0.415, 0.475, 0.018, 0.018) || inEllipse(0.615, 0.475, 0.018, 0.018))
      return [255, 255, 255];
    return INK;
  }
  // Sourire : anneau partiel sous les yeux.
  const d = Math.hypot(u - 0.5, v - 0.56);
  if (d > 0.085 && d < 0.115 && v > 0.6) return INK;
  if (inEllipse(0.31, 0.6, 0.045, 0.028) || inEllipse(0.69, 0.6, 0.045, 0.028)) return CHEEK;
  // Corps : grosse goutte arrondie + deux oreilles.
  if (
    inEllipse(0.5, 0.56, 0.3, 0.28) ||
    inEllipse(0.33, 0.33, 0.07, 0.09) ||
    inEllipse(0.67, 0.33, 0.07, 0.09)
  ) {
    return BODY;
  }
  const t = y;
  return TOP.map((c, i) => Math.round(c + (BOTTOM[i] - c) * t));
}

function render(size, options) {
  const ss = 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let aa = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const color = sample(
            (px + (sx + 0.5) / ss) / size,
            (py + (sy + 0.5) / ss) / size,
            options,
          );
          if (!color) continue;
          rr += color[0];
          gg += color[1];
          bb += color[2];
          aa += 1;
        }
      }
      const o = (py * size + px) * 4;
      if (aa > 0) {
        pixels[o] = Math.round(rr / aa);
        pixels[o + 1] = Math.round(gg / aa);
        pixels[o + 2] = Math.round(bb / aa);
      }
      pixels[o + 3] = Math.round((aa / (ss * ss)) * 255);
    }
  }
  return encodePng(size, size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];
for (const [file, size, options] of targets) {
  writeFileSync(join(out, file), render(size, options));
  console.log(`✔ ${file}`);
}

writeFileSync(
  join(out, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b7dff"/><stop offset="1" stop-color="#6a48f0"/></linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <ellipse cx="33" cy="33" rx="7" ry="9" fill="#fff8f0"/><ellipse cx="67" cy="33" rx="7" ry="9" fill="#fff8f0"/>
  <ellipse cx="50" cy="56" rx="30" ry="28" fill="#fff8f0"/>
  <ellipse cx="40" cy="50" rx="5" ry="6.5" fill="#2d2a3e"/><ellipse cx="60" cy="50" rx="5" ry="6.5" fill="#2d2a3e"/>
  <circle cx="41.5" cy="47.5" r="1.8" fill="#fff"/><circle cx="61.5" cy="47.5" r="1.8" fill="#fff"/>
  <ellipse cx="31" cy="60" rx="4.5" ry="2.8" fill="#ff9ab8"/><ellipse cx="69" cy="60" rx="4.5" ry="2.8" fill="#ff9ab8"/>
  <path d="M41 62 Q50 72 59 62" stroke="#2d2a3e" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>
`,
);
console.log('✔ icon.svg');
