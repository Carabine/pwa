// Склеивает walk.tpl.html + walk.js (+ walk-props*.js на месте /*__PROPS_EXTRA__*/) → walk.html.
// Внешний ES-модуль с file:// Chrome не грузит, поэтому всё встраивается в страницу.
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url);
const tpl = readFileSync(new URL('walk.tpl.html', dir), 'utf8');
const props = ['walk-life.js', 'walk-rooms.js', 'walk-rooms2.js', 'walk-matsuri.js', 'walk-sando.js', 'walk-talk.js', 'walk-write.js', 'walk-paper.js', 'walk-tv.js', 'walk-props.js', 'walk-props2.js', 'walk-props3.js', 'walk-places.js'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
// клипы стартовой колоды (реальные сцены из популярных аниме) — для экранов на улице
const deck = readFileSync(new URL('../js/starter-deck.js', dir), 'utf8'), starter = [], seen = new Set();
for (const m of deck.matchAll(/clip: '([^']+\.mp4)'([^\n]{0,400})/g)) { if (seen.has(m[1])) continue; seen.add(m[1]); const a = /\ba: '([^']+)'/.exec(m[2]) || [...deck.slice(Math.max(0, m.index - 400), m.index).matchAll(/\ba: '([^']+)'/g)].pop(); starter.push([m[1], a ? a[1] : '']); }
const js = readFileSync(new URL('walk.js', dir), 'utf8').replace('/*__PROPS_EXTRA__*/', () => props.replace('/*__STARTER_TV__*/[]', () => JSON.stringify(starter)));
writeFileSync(new URL('walk.html', dir), tpl.replace('/*__WALK_JS__*/', () => js));
console.log('walk.html собран; клипов для экранов:', starter.length);
