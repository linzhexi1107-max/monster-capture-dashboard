import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const port = Number(process.env.PREVIEW_PORT || 3100);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

http
  .createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filePath = path.resolve(
      docs,
      pathname === '/' ? 'index.html' : pathname.slice(1),
    );
    if (!filePath.startsWith(`${docs}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
      });
      response.end(content);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`Static preview: http://localhost:${port}`);
  });
