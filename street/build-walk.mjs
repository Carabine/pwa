// Склеивает walk.tpl.html + walk.js → walk.html (внешний ES-модуль с file:// Chrome не грузит).
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url);
const tpl = readFileSync(new URL('walk.tpl.html', dir), 'utf8');
const js = readFileSync(new URL('walk.js', dir), 'utf8');
writeFileSync(new URL('walk.html', dir), tpl.replace('/*__WALK_JS__*/', () => js));
console.log('walk.html собран');
