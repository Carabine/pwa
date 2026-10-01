// No dependencies. Rebuild the three portable HTML files: node street-codex/build.js
const fs = require('fs');
const path = require('path');
const template = fs.readFileSync(path.join(__dirname, 'street.template.html'), 'utf8');
const jlpt = fs.readFileSync(path.join(__dirname, '../data/jlpt-n5n3.json'), 'utf8').trim();
const regular = fs.readFileSync('D:/animei/_pp/fonts/Inter-Regular.ttf').toString('base64');
const semibold = fs.readFileSync('D:/animei/_pp/fonts/Inter-SemiBold.ttf').toString('base64');
for (const theme of ['shinjuku', 'yokocho', 'dotonbori']) {
  fs.writeFileSync(path.join(__dirname, theme + '.html'), template.replaceAll('__THEME__', theme).replace('__JLPT__', jlpt).replace('__INTER_REGULAR__',regular).replace('__INTER_SEMIBOLD__',semibold));
}
console.log('Built 3 self-contained streets.');
