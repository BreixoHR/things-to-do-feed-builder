'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Primera ejecución: se copia el feed de ejemplo
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'examples', 'feed-demo.json'), path.join(DATA_DIR, 'feed-demo.json'));
}

// Solo en local: es una herramienta de escritorio, no un servicio expuesto
createApp({ dataDir: DATA_DIR }).listen(PORT, '127.0.0.1', () => {
  console.log(`Things To Do Feed Builder en http://localhost:${PORT}`);
});
