const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [process.cwd(), 'D:/animei/_pp'] }));
const dir = path.join(__dirname, 'shots');
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'], defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
  const report = [];
  try {
    for (const theme of ['shinjuku', 'yokocho', 'dotonbori']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion', value:'reduce'}]);
      await page.goto(pathToFileURL(path.join(__dirname, theme + '.html')).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(dir, theme + '.png') });
      const initial = await page.evaluate(() => ({ mode:street.mode, words:street.words.length, blocks:street.blocks.length, signs:street.signs.length, width:document.documentElement.scrollWidth }));
      if (initial.words !== 60 || initial.signs !== 20 || initial.width !== 390) throw Error('Bad initial scene: ' + JSON.stringify(initial));
      const target = await page.evaluate(() => { const s=street.signs.find(s=>street.state(s.w)==='new');return {x:s.x+s.width/2,y:s.y+s.height/2,id:s.w.id}; });
      await page.touchscreen.tap(target.x, target.y);
      await page.waitForFunction(() => document.getElementById('card').open, {timeout:3000});
      await page.click('#review');await page.click('#remember');await page.click('#remember');
      const learned = await page.evaluate(id => street.state(street.words.find(w=>w.id===id)), target.id);
      if (learned !== 'learned') throw Error('Review failed');
      await page.click('#next');
      const deck = await page.$eval('#deck', e=>e.textContent);
      const client = await page.createCDPSession();
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:590}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:590}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const swipeDeck = await page.$eval('#deck',e=>e.textContent);
      if(swipeDeck!=='Твоё имя')throw Error('Swipe failed: '+swipeDeck);
      const png = await page.evaluate(async()=>{const blob=await street.exportPNG();return {type:blob.type,size:blob.size}});
      if (png.type !== 'image/png' || png.size < 50000) throw Error('PNG export failed');
      if(theme==='shinjuku'){
        await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
        await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true}));
        await page.click('#share');
        const download=path.join(dir,'animei-shinjuku.png');
        for(let attempt=0;attempt<40&&!fs.existsSync(download);attempt++)await new Promise(resolve=>setTimeout(resolve,100));
        if(!fs.existsSync(download))throw Error('Share button did not download PNG');
        const bytes=fs.readFileSync(download);
        if(bytes.readUInt32BE(16)!==780||bytes.readUInt32BE(20)!==1688)throw Error('Wrong PNG dimensions');
      }
      // 800 real words, an oversized deck, known-word schema, all five states.
      const real = await page.evaluate(() => {
        const keys=['words','srs:schedule:v2','animei:decks','animei:knownWords'];
        window.savedStorage=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
        const w=Array.from({length:800},(_,i)=>({id:'test-'+i,kanji:['雨','魔法','友達','約束'][i%4],kana:'あめ',translation:'Тест'}));
        localStorage.setItem('words',JSON.stringify(w));localStorage.setItem('animei:decks',JSON.stringify([{id:'big',name:'800 слов',wordIds:w.map(x=>x.id)}]));
        localStorage.setItem('srs:schedule:v2',JSON.stringify({'test-0':{reps:3,lapses:0,interval:21,due:'2099-01-01'},'test-1':{reps:3,lapses:0,interval:3,due:'2000-01-01'},'test-2':{reps:3,lapses:4,interval:3,due:'2000-01-01'}}));
        localStorage.setItem('animei:knownWords',JSON.stringify({version:1,words:['約束']}));
        const select=document.getElementById('source');select.value='real';select.dispatchEvent(new Event('change'));
        return {words:street.words.length,blocks:street.blocks.length,signs:street.signs.length,states:street.words.slice(0,5).map(street.state)};
      });
      if(real.words!==800||real.blocks!==40||real.signs!==20||real.states.join(',')!=='learned,due,forgot,learned,new')throw Error('Real-data test failed: '+JSON.stringify(real));
      await page.evaluate(()=>{for(const [k,v] of Object.entries(savedStorage))v===null?localStorage.removeItem(k):localStorage.setItem(k,v)});
      report.push({ theme, initial, learned, nextDeck:deck, swipeDeck, png, real, errors });
      if(errors.length)throw Error(errors.join('\n'));
      await page.close();
    }
    fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
