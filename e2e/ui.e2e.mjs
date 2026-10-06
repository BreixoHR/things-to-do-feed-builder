// E2E de la interfaz en Chromium/Edge headless vía CDP (sin dependencias).
// npm run test:e2e   ·   BROWSER_PATH=/ruta/a/chromium   ·   --screenshots regenera docs/editor.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER =
  process.env.BROWSER_PATH ||
  (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'chromium');
const SCREENSHOTS = process.argv.includes('--screenshots');
const { createApp } = require(`${REPO}/src/app.js`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n} ${extra}`);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttd-ui-'));
fs.copyFileSync(`${REPO}/examples/feed-demo.json`, path.join(dataDir, 'feed-demo.json'));
const server = createApp({ dataDir }).listen(3987, '127.0.0.1');
const base = 'http://127.0.0.1:3987';

const browser = spawn(BROWSER, [
  '--headless=new', '--remote-debugging-port=9340', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'edge-'))}`,
  '--window-size=1280,900', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch('http://127.0.0.1:9340/json')).json(); } catch { await sleep(200); } }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const dialogs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Page.javascriptDialogOpening') {
      dialogs.push(m.params.message);
      send('Page.handleJavaScriptDialog', { accept: true });
    }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable');

  // Producto con título malicioso importado por la API
  await fetch(`${base}/api/feeds/demo/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products: [{ id: 'xss', title: { localized_texts: [{ language_code: 'es', text: '<img src=x onerror="window.__pwned=1">Malicioso' }] }, options: [] }] }),
  });

  await send('Page.navigate', { url: base });
  await sleep(1500);
  check('carga la lista de productos', (await ev(`document.querySelectorAll('.product-card').length`)) === 3);
  check('el título malicioso se muestra como texto', (await ev(`[...document.querySelectorAll('.product-card h4')].some(h => h.textContent.includes('<img'))`)) === true);
  check('no se ejecuta el onerror', (await ev(`window.__pwned === undefined`)) === true);
  check('selector de feeds', (await ev(`document.getElementById('feed-selector').value`)) === 'demo');

  // Validar el feed: el producto "xss" no tiene opciones → error
  dialogs.length = 0;
  await ev(`validateCurrentFeed()`); await sleep(400);
  check('validar muestra los errores', /al menos una opción/.test(dialogs[0] || ''), (dialogs[0] || '').split('\n')[0]);

  // Editar un producto existente rellena el formulario
  await ev(`editProduct('demo-city-museum')`); await sleep(600);
  check('editar rellena el formulario', (await ev(`document.getElementById('titleEs').value`)) === 'Visita guiada al Museo de la Ciudad');
  const priceVal = await ev(`document.querySelector('.price-option-units')?.value`);
  check('precio cargado', !!priceVal, `(${priceVal})`);

  // Fila de precio visible (no las plantillas ocultas)
  const row = "[...document.querySelectorAll('.price-option-units')].find(i => i.offsetParent && i.value === '29').closest('div')";
  check('fila de precio visible', (await ev(`Boolean(${row})`)) === true);

  // Nanos inválidos → aviso y no se guarda
  dialogs.length = 0;
  await ev(`(() => { const r = ${row}; r.querySelector('.price-option-nanos').value = '99abc'; document.getElementById('productForm').requestSubmit(); })()`);
  await sleep(600);
  check('nanos inválidos bloquean el guardado', /Nanos no válidos/.test(dialogs.join(' ')), dialogs[0]);
  const stored = await (await fetch(`${base}/api/feeds/demo/products/demo-city-museum`)).json();
  check('el producto guardado no cambia', stored.options[0].price_options[0].price.nanos === 900000000);

  // Importe válido → se guarda
  dialogs.length = 0;
  await ev(`(() => { const r = ${row}; r.querySelector('.price-option-units').value = '31'; r.querySelector('.price-option-nanos').value = '500000000'; document.getElementById('productForm').requestSubmit(); })()`);
  await sleep(1000);
  const saved = await (await fetch(`${base}/api/feeds/demo/products/demo-city-museum`)).json();
  const price = saved.options[0].price_options.find(p => p.id === 'adult')?.price;
  check('precio editado guardado', price && Number(price.units) === 31 && price.nanos === 500000000, JSON.stringify(price));

  if (SCREENSHOTS) {
    await send('Page.navigate', { url: base }); await sleep(1200);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(`${REPO}/docs`, { recursive: true });
    fs.writeFileSync(`${REPO}/docs/editor.png`, Buffer.from(shot.result.data, 'base64'));
  }
  ws.close();
} catch (e) {
  results.push('ERROR ' + e.stack);
} finally {
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => !r.startsWith('PASS')) ? 1 : 0;
  browser.kill(); server.close();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* Windows puede tenerlo aún bloqueado */ }
  setTimeout(() => process.exit(), 300);
}
