'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { createFeedStore, FeedError } = require('./feedStore');
const { validateFeed } = require('./validate');

function createApp({ dataDir }) {
  const store = createFeedStore(dataDir);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20mb' }));

  // Herramienta local: sin CORS abierto (cualquier web visitada podría modificar los feeds)
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
    next();
  });

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  const newId = () => `product-${crypto.randomUUID().slice(0, 8)}`;

  function productFromBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new FeedError(400, 'Producto no válido');
    return { ...body, id: body.id || newId() };
  }

  app.get('/api/feeds', wrap(async (req, res) => res.json({ feeds: await store.list() })));
  app.post('/api/feeds', wrap(async (req, res) => {
    await store.create(String(req.body?.name || '').trim());
    res.status(201).json({ feeds: await store.list() });
  }));
  app.delete('/api/feeds/:feed', wrap(async (req, res) => {
    await store.remove(req.params.feed);
    res.json({ feeds: await store.list() });
  }));

  app.get('/api/feeds/:feed', wrap(async (req, res) => res.json(await store.get(req.params.feed))));
  app.get('/api/feeds/:feed/validate', wrap(async (req, res) => res.json(validateFeed(await store.get(req.params.feed)))));

  /** Exportación: por defecto se niega si el feed tiene errores (?force=1 para descargar igualmente). */
  app.get('/api/feeds/:feed/export', wrap(async (req, res) => {
    const feed = await store.get(req.params.feed);
    const report = validateFeed(feed);
    if (!report.valid && req.query.force !== '1') return res.status(422).json(report);
    res.set('Content-Disposition', `attachment; filename="things-to-do-${req.params.feed}.json"`);
    res.json(feed);
  }));

  app.get('/api/feeds/:feed/products/:id', wrap(async (req, res) => {
    const product = (await store.get(req.params.feed)).products.find((p) => p.id === req.params.id);
    if (!product) throw new FeedError(404, `No existe el producto "${req.params.id}"`);
    res.json(product);
  }));
  app.post('/api/feeds/:feed/products', wrap(async (req, res) => {
    res.status(201).json(await store.addProduct(req.params.feed, productFromBody(req.body)));
  }));
  app.put('/api/feeds/:feed/products/:id', wrap(async (req, res) => {
    res.json(await store.replaceProduct(req.params.feed, req.params.id, productFromBody(req.body)));
  }));
  app.delete('/api/feeds/:feed/products/:id', wrap(async (req, res) => {
    res.json(await store.removeProduct(req.params.feed, req.params.id));
  }));
  app.post('/api/feeds/:feed/import', wrap(async (req, res) => {
    const products = req.body?.products;
    if (!Array.isArray(products)) throw new FeedError(400, 'Se espera { "products": [...] }');
    res.json(await store.importProducts(req.params.feed, products.map(productFromBody)));
  }));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/lib/price.js', (req, res) => res.sendFile(path.join(__dirname, 'price.js')));

  app.use((err, req, res, next) => {
    if (err instanceof FeedError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Demasiado grande' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
}

module.exports = { createApp };
