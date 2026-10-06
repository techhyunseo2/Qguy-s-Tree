// 화면 점검용 서버: node tests/serve.mjs → http://localhost:8765/tree.html?c=x
// Firebase 대신 tests/mock-store.js 를 /js/store.js 자리에 내준다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = join(import.meta.dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const port = +(process.env.PORT || 8765);

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = p === '/js/store.js' ? join(root, 'tests', 'mock-store.js') : join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('없음'); }
}).listen(port, () => console.log(`http://localhost:${port}/`));
