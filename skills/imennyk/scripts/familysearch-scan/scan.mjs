// usage: node scripts/familysearch-scan/scan.mjs <ark-view-url> <out.jpg>
// Opens the FamilySearch viewer in a new tab, finds the deep-zoom image id, loads every tile of the top level
// inside the browser (img elements) and reads the tile bytes through CDP Network.getResponseBody, then stitches with ImageMagick.
import fs from 'node:fs'; import { execFileSync } from 'node:child_process'; import os from 'node:os'; import path from 'node:path';
const [url, out] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
try {
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Page.enable');
  await send('Page.navigate', { url });
  let base = null;
  for (let i = 0; i < 40 && !base; i++) { await sleep(1000); base = await ev(`(()=>{const e=document.querySelector('img.imageTileCss_iydyqse');return e?e.src.replace(/\\/image_files\\/.*$/,''):null})()`); }
  if (!base) throw new Error('no tile base (not logged in or viewer failed)');
  // probe levels and grid inside the page
  const info = await ev(`(async()=>{const base=${JSON.stringify(base)};
    const ok=(L,c,r)=>new Promise(res=>{const i=new Image();i.onload=()=>res([i.naturalWidth,i.naturalHeight]);i.onerror=()=>res(null);i.src=base+'/image_files/'+L+'/'+c+'_'+r+'.jpg?p='+Math.random()});
    let L=9;while(await ok(L+1,0,0))L++;
    let cols=0;while(await ok(L,cols,0))cols++;let rows=0;while(await ok(L,0,rows))rows++;
    const last=await ok(L,cols-1,rows-1),first=await ok(L,0,0);
    return {L,cols,rows,first,last}})()`);
  // load all tiles (distinct urls, no query) and collect bodies
  reqs.clear(); finished.clear();
  await ev(`(()=>{const base=${JSON.stringify(base)};window.__t=[];for(let r=0;r<${info.rows};r++)for(let c=0;c<${info.cols};c++){const i=new Image();i.src=base+'/image_files/${info.L}/'+c+'_'+r+'.jpg?t='+Date.now();window.__t.push(i)}return 1})()`);
  const want = info.cols * info.rows;
  for (let i = 0; i < 120; i++) { await sleep(500); if ([...reqs.entries()].filter(([k, v]) => v.url.includes(`/image_files/${info.L}/`) && finished.has(k)).length >= want) break; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir().replace(/^\/tmp.*/, '/var/tmp'), 'tiles-'));
  let n = 0;
  for (const [k, v] of reqs) { const m = v.url.match(/image_files\/(\d+)\/(\d+)_(\d+)\.jpg/); if (!m || Number(m[1]) !== info.L || !finished.has(k)) continue;
    const b = await send('Network.getResponseBody', { requestId: k }); fs.writeFileSync(path.join(dir, `${m[2]}_${m[3]}.jpg`), Buffer.from(b.result.body, b.result.base64Encoded ? 'base64' : 'utf8')); n++; }
  if (n < want) throw new Error(`tiles ${n}/${want}`);
  // stitch: tile size 256 with 1px overlap (except first col/row)
  const TS = 256;
  const rowFiles = [];
  for (let r = 0; r < info.rows; r++) {
    const parts = [];
    for (let c = 0; c < info.cols; c++) { const f = path.join(dir, `${c}_${r}.jpg`); const cr = path.join(dir, `c${c}_${r}.png`);
      const x = c === 0 ? 0 : 1, y = r === 0 ? 0 : 1;
      execFileSync('magick', [f, '-chop', `${x}x${y}`, '+repage', cr]); parts.push(cr); }
    const rf = path.join(dir, `row${r}.png`); execFileSync('magick', [...parts, '+append', rf]); rowFiles.push(rf);
  }
  execFileSync('magick', [...rowFiles, '-append', '-quality', '92', out]);
  fs.rmSync(dir, { recursive: true });
  console.log(JSON.stringify({ out, ...info }));
} finally { await close(); process.exit(0); }
