// Скачивает three@0.160.0 и нужные дополнения (со всеми относительными зависимостями) в ./vendor/three/
// — чтобы «Улица слов» не зависела от CDN. Запуск: node fetch-three.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const BASE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const START = ['build/three.module.min.js', 'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js', 'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/objects/Reflector.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/geometries/RoundedBoxGeometry.js', 'examples/jsm/environments/RoomEnvironment.js'];
const seen = new Set(); const queue = [...START]; let bytes = 0;
while (queue.length) {
    const rel = queue.shift(); if (seen.has(rel)) continue; seen.add(rel);
    const r = await fetch(BASE + rel); if (!r.ok) throw new Error(rel + ' ' + r.status);
    const txt = await r.text(); bytes += txt.length;
    mkdirSync('vendor/three/' + dirname(rel), { recursive: true }); writeFileSync('vendor/three/' + rel, txt);
    for (const m of txt.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) { const u = new URL(m[1], 'http://x/' + rel).pathname.slice(1); queue.push(u); }
}
console.log('файлов:', seen.size, 'объём:', (bytes / 1024).toFixed(0), 'KB'); console.log([...seen].join('\n'));
