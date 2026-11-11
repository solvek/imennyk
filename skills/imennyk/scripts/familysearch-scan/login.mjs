// Signs the Chrome on the host in to FamilySearch with the account from the environment.
//   node scripts/familysearch-scan/login.mjs [path of the .env, default .env of the current folder]
// Reads FAMILY_SEARCH_USER and FAMILY_SEARCH_PASSWORD (from the environment or the .env), types them into the
// login form through CDP (port 9222) and waits for the redirect. Nothing is printed or written to disk.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The password may hold «#» and «$», which `node --env-file` cuts or expands, so the line is read raw.
import fs from 'node:fs';
const envFile = process.argv[2] ?? '.env';
const raw = Object.fromEntries(
  (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const user = process.env.FAMILY_SEARCH_USER ?? raw.FAMILY_SEARCH_USER;
const password = raw.FAMILY_SEARCH_PASSWORD ?? process.env.FAMILY_SEARCH_PASSWORD;
if (!user || !password) throw new Error('FAMILY_SEARCH_USER / FAMILY_SEARCH_PASSWORD are not set');

const tab = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.result.value;
const typeInto = async (selector, text) => {
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await send('Input.insertText', { text });
};
try {
  await send('Page.enable');
  await send('Page.navigate', { url: 'https://www.familysearch.org/auth/familysearch/login' });
  for (let i = 0; i < 60 && !(await ev(`!!document.querySelector('#userName')`)); i++) await sleep(500);
  if (!(await ev(`!!document.querySelector('#userName')`))) {
    console.log('no login form: ' + (await ev('location.href')) + ' (already signed in?)');
  } else {
    await typeInto('#userName', user);
    await typeInto('#password', password);
    await ev(`document.querySelector('#login').click()`);
    for (let i = 0; i < 60 && (await ev('location.host')).startsWith('ident.'); i++) await sleep(500);
    const host = await ev('location.host');
    console.log(host.startsWith('ident.') ? 'login failed (still on the login page): ' + (await ev(`document.body.innerText.replace(/\\s+/g,' ').slice(0,300)`)) : 'signed in');
    process.exitCode = host.startsWith('ident.') ? 1 : 0;
  }
} finally {
  await fetch('http://127.0.0.1:9222/json/close/' + tab.id);
  process.exit(process.exitCode ?? 0);
}
