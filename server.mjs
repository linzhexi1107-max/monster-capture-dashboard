import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hasDatabaseConfig } from './src/config.mjs';
import { closeDatabase } from './src/query.mjs';
import { ensureSnapshotFresh, startDailyRefreshScheduler } from './src/refresh.mjs';
import { getDashboard } from './src/service.mjs';
import { isDateString, todayShanghai } from './src/time.mjs';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(rootDirectory, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function securityHeaders() {
  return {
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function cleanFilterValue(value, maxLength = 80) {
  return String(value || '').trim().slice(0, maxLength);
}

async function handleApi(requestUrl, response) {
  if (requestUrl.pathname === '/healthz') {
    sendJson(response, 200, {
      ok: true,
      databaseConfigured: hasDatabaseConfig(),
      now: new Date().toISOString(),
    });
    return;
  }

  if (requestUrl.pathname !== '/api/data') {
    sendJson(response, 404, { error: '接口不存在。' });
    return;
  }

  const startDate = cleanFilterValue(requestUrl.searchParams.get('start_date'), 10);
  const endDate = cleanFilterValue(requestUrl.searchParams.get('end_date'), 10);
  if (startDate && !isDateString(startDate)) {
    sendJson(response, 400, { error: 'start_date 格式应为 YYYY-MM-DD。' });
    return;
  }
  if (endDate && !isDateString(endDate)) {
    sendJson(response, 400, { error: 'end_date 格式应为 YYYY-MM-DD。' });
    return;
  }
  if (startDate && endDate && startDate > endDate) {
    sendJson(response, 400, { error: '开始日期不能晚于结束日期。' });
    return;
  }

  const payload = await getDashboard({
    startDate,
    endDate,
    arenaId: cleanFilterValue(requestUrl.searchParams.get('arena_id')),
    monsterNames: requestUrl.searchParams
      .getAll('monster_name')
      .flatMap((value) => value.split(','))
      .map((value) => cleanFilterValue(value, 120))
      .filter(Boolean),
  });
  sendJson(response, 200, payload);
}

async function serveStatic(requestUrl, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(publicDirectory, relativePath);
  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404, securityHeaders());
    response.end('Not found');
  }
}

export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`);
      if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname === '/healthz') {
        await handleApi(requestUrl, response);
      } else if (request.method === 'GET' || request.method === 'HEAD') {
        await serveStatic(requestUrl, response);
      } else {
        response.writeHead(405, {
          ...securityHeaders(),
          Allow: 'GET, HEAD',
        });
        response.end('Method not allowed');
      }
    } catch (error) {
      console.error('[server]', error);
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: hasDatabaseConfig()
            ? '数据读取失败，请查看服务器日志。'
            : '页面暂时无法加载。',
        });
      } else {
        response.end();
      }
    }
  });
}

export async function startServer() {
  const server = createServer();
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[server] 已启动：http://localhost:${config.port}`);
  });
  const stopScheduler = startDailyRefreshScheduler();

  if (hasDatabaseConfig()) {
    console.log('[startup] 服务已启动，正在后台检查数据库快照。');
    ensureSnapshotFresh()
      .then((snapshot) => {
        console.log(
          `[startup] 数据已就绪：${snapshot?.rows?.length || 0} 行，最后更新 ${snapshot?.meta?.updatedAtShanghai || '未知'}。`,
        );
      })
      .catch((error) => {
        console.error(
          '[startup] 数据库初始化失败，页面会尝试使用最近一次快照：',
          error.message,
        );
      });
  } else {
    console.log('[startup] MySQL 未配置，使用演示数据。上海日期：', todayShanghai());
  }

  const shutdown = async () => {
    console.log('[server] 正在关闭服务。');
    stopScheduler();
    server.close();
    await closeDatabase().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
