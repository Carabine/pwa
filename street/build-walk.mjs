// Склеивает walk.tpl.html + walk.js (+ walk-props*.js на месте /*__PROPS_EXTRA__*/) → walk.html.
// Внешний ES-модуль с file:// Chrome не грузит, поэтому всё встраивается в страницу.
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url);
const tpl = readFileSync(new URL('walk.tpl.html', dir), 'utf8');
const props = ['walk-life.js', 'walk-rooms.js', 'walk-matsuri.js', 'walk-sando.js', 'walk-talk.js', 'walk-props.js', 'walk-props2.js', 'walk-props3.js', 'walk-places.js'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const js = readFileSync(new URL('walk.js', dir), 'utf8').replace('/*__PROPS_EXTRA__*/', () => props);
writeFileSync(new URL('walk.html', dir), tpl.replace('/*__WALK_JS__*/', () => js));
console.log('walk.html собран');
