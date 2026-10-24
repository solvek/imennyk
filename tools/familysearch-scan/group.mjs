// Helper for a FamilySearch image group (like scan.mjs, but for many images of one group), through the Chrome on the host (CDP, port 9222).
//   node import/familysearch-dgs/group.mjs apids <first-image-url> <count> <out.json>
//       walks the viewer with ArrowRight and writes {image number: deep-zoom id (apid)} for every image of the group;
//   node import/familysearch-dgs/group.mjs tiles <apids.json> <level|top|-N> <outdir> <1,5-9,…>
//       downloads the listed images as <outdir>/<n>.jpg; level: absolute, «top» (full size) or N levels below the top (-3 = a small preview).
// The tiles are loaded as <img> inside the logged-in browser and read through CDP Network.getResponseBody; cookies never leave the browser.
// Used for DAVoO 35/9/532 (Novosilky), see import/novosilky-532.md; the apid file of that group is import/novosilky-532/apids.json.
// usage:
//   node fsgroup.mjs apids <first-image-url> <count> <out.json>      walk the viewer with ArrowRight, record deep-zoom id (apid) of each image
//   node fsgroup.mjs tiles <apids.json> <level|top|-N> <outdir> <n,n-m,...>   download images (level: absolute, "top", or N levels below top)
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [cmd, ...args] = process.argv.slice(2);

async function openTab(url) {
  const t = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const reqs = new Map(); const finished = new Set();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Network.responseReceived') reqs.set(m.params.requestId, { url: m.params.response.url, status: m.params.response.status });
    else if (m.method === 'Network.loadingFinished') finished.add(m.params.requestId); });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
  const close = async () => { await fetch('http://127.0.0.1:9222/json/close/' + t.id); };
  await send('Network.enable'); await send('Page.enable');
  await send('Page.navigate', { url });
  return { send, ev, reqs, finished, close };
}

const TILE_SEL = `img.imageTileCss_iydyqse`;
const tileBase = `(()=>{const e=document.querySelector('${TILE_SEL}');return e?e.src.replace(/\\/image_files\\/.*$/,''):null})()`;
const imgNum = `(()=>{const e=document.querySelector('input[type=number]');return e?Number(e.value):null})()`;

if (cmd === 'apids') {
  const [url, count, out] = args; const total = Number(count);
  const tab = await openTab(url);
  try {
    const apids = {};
    const waitBase = async (prev) => { for (let i = 0; i < 200; i++) { await sleep(100); const b = await tab.ev(tileBase); if (b && b !== prev) return b; } return null; };
    let base = await waitBase(null); if (!base) throw new Error('viewer did not load (not logged in?)');
    let n = await tab.ev(imgNum); apids[n] = base.match(/apid:([^/]+)/)?.[1];
    while (n < total) {
      await tab.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',keyCode:39,which:39,bubbles:true}))`);
      const nb = await waitBase(base); if (!nb) { console.error('stuck after', n); break; }
      base = nb; await sleep(150);
      const m = await tab.ev(imgNum); if (m !== n + 1) console.error('number jump', n, '->', m);
      n = m; apids[n] = base.match(/apid:([^/]+)/)?.[1];
      if (n % 50 === 0) console.error('at', n);
    }
    fs.writeFileSync(out, JSON.stringify(apids));
    console.log(JSON.stringify({ got: Object.keys(apids).length, last: n }));
  } finally { await tab.close(); }
} else if (cmd === 'tiles') {
  const [apidsFile, levelArg, outdir, list] = args;
  const apids = JSON.parse(fs.readFileSync(apidsFile, 'utf8'));
  const nums = list.split(',').flatMap(p => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
  fs.mkdirSync(outdir, { recursive: true });
  const first = Object.values(apids)[0];
  const tab = await openTab('https://www.familysearch.org/ark:/61903/3:1:3QHV-V7CR-X1WK?view=explore&groupId=TH-7760-143866-17913-51&lang=uk');
  try {
    for (let i = 0; i < 100; i++) { await sleep(300); if (await tab.ev(tileBase)) break; }
    for (const n of nums) {
      const out = path.join(outdir, `${n}.jpg`); if (fs.existsSync(out)) continue;
      const base = `https://sg30p0.familysearch.org/service/records/storage/deepzoomcloud/dz/v1/apid:${apids[n]}`;
      const info = await tab.ev(`(async()=>{const base=${JSON.stringify(base)};
        const ok=(L,c,r)=>new Promise(res=>{const i=new Image();i.onload=()=>res([i.naturalWidth,i.naturalHeight]);i.onerror=()=>res(null);i.src=base+'/image_files/'+L+'/'+c+'_'+r+'.jpg?p='+Math.random()});
        let top=9;while(await ok(top+1,0,0))top++;
        const want=${JSON.stringify(levelArg)}==='top'?top:(${JSON.stringify(levelArg)}[0]==='-'?top+Number(${JSON.stringify(levelArg)}):Number(${JSON.stringify(levelArg)}));
        let cols=0;while(await ok(want,cols,0))cols++;let rows=0;while(await ok(want,0,rows))rows++;
        return {top,L:want,cols,rows}})()`);
      tab.reqs.clear(); tab.finished.clear();
      await tab.ev(`(()=>{const base=${JSON.stringify(base)};window.__t=[];for(let r=0;r<${info.rows};r++)for(let c=0;c<${info.cols};c++){const i=new Image();i.src=base+'/image_files/${info.L}/'+c+'_'+r+'.jpg?t='+Date.now();window.__t.push(i)}return 1})()`);
      const want = info.cols * info.rows;
      for (let i = 0; i < 240; i++) { await sleep(250); if ([...tab.reqs.entries()].filter(([k, v]) => v.url.includes(`/image_files/${info.L}/`) && tab.finished.has(k)).length >= want) break; }
      const dir = fs.mkdtempSync('/var/tmp/tiles-'); let got = 0;
      for (const [k, v] of tab.reqs) { const m = v.url.match(/image_files\/(\d+)\/(\d+)_(\d+)\.jpg/); if (!m || Number(m[1]) !== info.L || !tab.finished.has(k)) continue;
        const b = await tab.send('Network.getResponseBody', { requestId: k }); fs.writeFileSync(path.join(dir, `${m[2]}_${m[3]}.jpg`), Buffer.from(b.result.body, b.result.base64Encoded ? 'base64' : 'utf8')); got++; }
      if (got < want) { console.error(`image ${n}: tiles ${got}/${want}`); fs.rmSync(dir, { recursive: true }); continue; }
      const rowFiles = [];
      for (let r = 0; r < info.rows; r++) { const parts = [];
        for (let c = 0; c < info.cols; c++) { const f = path.join(dir, `${c}_${r}.jpg`), cr = path.join(dir, `c${c}_${r}.png`);
          execFileSync('magick', [f, '-chop', `${c === 0 ? 0 : 1}x${r === 0 ? 0 : 1}`, '+repage', cr]); parts.push(cr); }
        const rf = path.join(dir, `row${r}.png`); execFileSync('magick', [...parts, '+append', rf]); rowFiles.push(rf); }
      execFileSync('magick', [...rowFiles, '-append', '-quality', '90', out]);
      fs.rmSync(dir, { recursive: true });
      console.log(n, JSON.stringify(info));
    }
  } finally { await tab.close(); }
}
