// Генерация PNG-иконок из мастер-SVG (pwa/img/logo.svg) через sharp.
// Запуск: node gen-icons.js
import sharp from 'sharp';
import { readFileSync } from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');          // D:\animei
const svgPath = path.resolve(root, 'pwa', 'img', 'logo.svg');
const svg = readFileSync(svgPath);

// куда и в каком размере
const targets = [
    ['pwa/img/icons/32x32.png', 32],
    ['pwa/img/icons/128x128.png', 128],
    ['pwa/img/icons/256x256.png', 256],
    ['pwa/img/icons/512x512.png', 512],
    ['pwa/img/icon.png', 512],
    ['pwa/img/pwa.png', 512],
    ['pwa/img/favicon.png', 48],
    ['landing/img/favicon.png', 48],
    ['landing/img/icon-128.png', 128],
];

for (const [rel, size] of targets) {
    const out = path.resolve(root, rel);
    await sharp(svg, { density: 384 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(out);
    console.log('ok', rel, size);
}
console.log('done');
