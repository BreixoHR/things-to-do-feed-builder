'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Almacén de feeds en ficheros JSON (uno por feed), pensado para uso local de un equipo pequeño.
 *
 * - Cada modificación es leer → cambiar → escribir. Sin coordinación, dos peticiones simultáneas
 *   leen la misma versión y la segunda escritura borra la primera (se pierden productos).
 *   → Todas las operaciones de un feed se encadenan en una cola (mutex por feed).
 * - Escritura atómica (fichero temporal + rename): un corte a mitad de escritura no deja JSON roto.
 * - Los nombres de feed se validan con lista blanca: nada de rutas arbitrarias.
 */

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

class FeedError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function emptyFeed() {
  return {
    feed_metadata: { shard_id: 0, total_shards_count: 1, processing_instruction: 'PROCESS_AS_SNAPSHOT', nonce: Date.now() },
    products: [],
  };
}

function createFeedStore(dataDir) {
  const queues = new Map();

  function assertName(name) {
    if (!NAME_RE.test(name || '')) throw new FeedError(400, 'Nombre de feed no válido (a-z, 0-9, _ y -)');
  }

  const fileFor = (name) => path.join(dataDir, `feed-${name}.json`);

  /** Ejecuta `fn` en exclusiva para el feed `name`. */
  function exclusive(name, fn) {
    const prev = queues.get(name) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    queues.set(name, tail);
    tail.then(() => queues.get(name) === tail && queues.delete(name));
    return run;
  }

  async function readFeed(name) {
    try {
      return JSON.parse(await fs.readFile(fileFor(name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') throw new FeedError(404, `No existe el feed "${name}"`);
      throw err;
    }
  }

  async function writeFeed(name, data) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${fileFor(name)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, fileFor(name));
  }

  /** Lee, aplica `mutator(feed)` y guarda, en exclusiva. Devuelve lo que devuelva el mutator. */
  function update(name, mutator) {
    assertName(name);
    return exclusive(name, async () => {
      const feed = await readFeed(name);
      const result = await mutator(feed);
      feed.feed_metadata.nonce = Date.now();
      await writeFeed(name, feed);
      return result;
    });
  }

  return {
    async list() {
      await fs.mkdir(dataDir, { recursive: true });
      return (await fs.readdir(dataDir))
        .map((f) => /^feed-([a-zA-Z0-9_-]+)\.json$/.exec(f)?.[1])
        .filter(Boolean)
        .sort();
    },

    get(name) {
      assertName(name);
      return readFeed(name);
    },

    create(name) {
      assertName(name);
      return exclusive(name, async () => {
        try {
          await fs.access(fileFor(name));
          throw new FeedError(409, `Ya existe el feed "${name}"`);
        } catch (err) {
          if (err instanceof FeedError) throw err;
        }
        await writeFeed(name, emptyFeed());
      });
    },

    remove(name) {
      assertName(name);
      return exclusive(name, async () => {
        await fs.unlink(fileFor(name)).catch((err) => {
          if (err.code === 'ENOENT') throw new FeedError(404, `No existe el feed "${name}"`);
          throw err;
        });
      });
    },

    addProduct(name, product) {
      return update(name, (feed) => {
        if (feed.products.some((p) => p.id === product.id)) throw new FeedError(409, `Ya existe el producto "${product.id}"`);
        feed.products.push(product);
        return product;
      });
    },

    replaceProduct(name, id, product) {
      return update(name, (feed) => {
        const i = feed.products.findIndex((p) => p.id === id);
        if (i === -1) throw new FeedError(404, `No existe el producto "${id}"`);
        feed.products[i] = { ...product, id };
        return feed.products[i];
      });
    },

    removeProduct(name, id) {
      return update(name, (feed) => {
        const i = feed.products.findIndex((p) => p.id === id);
        if (i === -1) throw new FeedError(404, `No existe el producto "${id}"`);
        return feed.products.splice(i, 1)[0];
      });
    },

    /** Carga masiva: añade los nuevos y omite los IDs ya existentes. */
    importProducts(name, products) {
      return update(name, (feed) => {
        const ids = new Set(feed.products.map((p) => p.id));
        let added = 0;
        for (const p of products) {
          if (ids.has(p.id)) continue;
          ids.add(p.id);
          feed.products.push(p);
          added++;
        }
        return { added, skipped: products.length - added, total: feed.products.length };
      });
    },
  };
}

module.exports = { createFeedStore, FeedError, emptyFeed };
