const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const demo = require('../examples/feed-demo.json');

let server;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttd-'));
  fs.writeFileSync(path.join(dataDir, 'feed-demo.json'), JSON.stringify(demo));
  await new Promise((r) => (server = createApp({ dataDir }).listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const product = (id) => ({
  id,
  title: { localized_texts: [{ language_code: 'en', text: `Tour ${id}` }] },
  options: [{ id: `${id}-o`, title: { localized_texts: [{ language_code: 'en', text: 'Std' }] }, landing_page: { url: 'https://example.com' } }],
});

test('crea feeds y rechaza nombres peligrosos o repetidos', async () => {
  assert.equal((await call('POST', '/api/feeds', { name: 'granada' })).status, 201);
  assert.equal((await call('POST', '/api/feeds', { name: 'granada' })).status, 409);
  assert.equal((await call('POST', '/api/feeds', { name: '../../etc' })).status, 400);
  assert.deepEqual((await call('GET', '/api/feeds')).body.feeds, ['demo', 'granada']);
  assert.equal((await call('GET', '/api/feeds/..%2F..%2Fsecret')).status, 400);
});

test('CRUD de productos', async () => {
  assert.equal((await call('POST', '/api/feeds/granada/products', product('p1'))).status, 201);
  assert.equal((await call('POST', '/api/feeds/granada/products', product('p1'))).status, 409);

  const generated = await call('POST', '/api/feeds/granada/products', { ...product(''), id: undefined });
  assert.match(generated.body.id, /^product-[0-9a-f]{8}$/);

  const updated = await call('PUT', '/api/feeds/granada/products/p1', { ...product('otro'), rating: { average_value: 5, rating_count: 3 } });
  assert.equal(updated.body.id, 'p1', 'el id de la URL manda');
  assert.equal((await call('GET', '/api/feeds/granada/products/p1')).body.rating.average_value, 5);

  assert.equal((await call('DELETE', '/api/feeds/granada/products/p1')).status, 200);
  assert.equal((await call('GET', '/api/feeds/granada/products/p1')).status, 404);
});

test('50 altas simultáneas: no se pierde ningún producto', async () => {
  await call('POST', '/api/feeds', { name: 'concurrent' });
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => call('POST', '/api/feeds/concurrent/products', product(`c${i}`))));
  assert.ok(results.every((r) => r.status === 201));
  const feed = (await call('GET', '/api/feeds/concurrent')).body;
  assert.equal(feed.products.length, 50);
  // Y el fichero en disco es JSON válido (escritura atómica)
  JSON.parse(fs.readFileSync(path.join(dataDir, 'feed-concurrent.json'), 'utf8'));
});

test('importación masiva omite duplicados', async () => {
  const r = await call('POST', '/api/feeds/granada/import', { products: [product('i1'), product('i2'), product('i1')] });
  assert.deepEqual({ added: r.body.added, skipped: r.body.skipped }, { added: 2, skipped: 1 });
  assert.equal((await call('POST', '/api/feeds/granada/import', { nope: 1 })).status, 400);
});

test('exportación bloqueada si el feed tiene errores (salvo ?force=1)', async () => {
  const ok = await fetch(`${base}/api/feeds/demo/export`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-disposition'), /things-to-do-demo\.json/);

  await call('POST', '/api/feeds/granada/products', { ...product('bad'), options: [] });
  const blocked = await call('GET', '/api/feeds/granada/export');
  assert.equal(blocked.status, 422);
  assert.ok(blocked.body.errors.some((e) => /al menos una opción/.test(e.message)));
  assert.equal((await call('GET', '/api/feeds/granada/export?force=1')).status, 200);
});

test('rechaza peticiones desde otros orígenes (CSRF desde una web visitada)', async () => {
  const r = await call('DELETE', '/api/feeds/demo', undefined, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal((await call('GET', '/api/feeds/demo', undefined, { Origin: 'http://localhost:3000' })).status, 200);
});

test('sirve la UI y la librería de precios', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /Things To Do Feed Builder/);
  assert.match(await (await fetch(`${base}/lib/price.js`)).text(), /parseAmount/);
});
