import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { QuizService, createQuizHandler, sendJson } from './api.ts';

/**
 * Боевой сервер «Костров»: раздаёт собранную игру из dist/ и API вопросов (как server.js в
 * Morskoy). Собирается в dist-server/index.js (`npm run build`), запускается `npm start`.
 * Порт — PORT (по умолчанию 3000); слушаем все интерфейсы, иначе проверка здоровья платформы
 * не достучится до контейнера.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.STATIC_DIR || join(here, '..', 'dist'));
const port = Number(process.env.PORT) || 3000;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

/** Сжатые копии статики: собранная игра неизменна, жмём каждый файл один раз. */
const gzipCache = new Map<string, Buffer>();

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    return sendJson(res, 400, { error: 'bad path' });
  }
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep))
    return sendJson(res, 403, { error: 'forbidden' });

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  // Одностраничная игра: неизвестный путь без расширения — это index.html.
  if (!info && !extname(path)) {
    file = join(root, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info || !info.isFile()) return sendJson(res, 404, { error: 'not found' });

  const ext = extname(file).toLowerCase();
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  // Файлы из assets/ — с хешем в имени, их можно кешировать навсегда; страницу — нет.
  const hashed = file.startsWith(join(root, 'assets') + sep);
  res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');

  const gzip =
    COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  if (gzip) {
    let packed = gzipCache.get(file);
    if (!packed) {
      packed = gzipSync(await readFile(file));
      gzipCache.set(file, packed);
    }
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', packed.length);
    res.end(req.method === 'HEAD' ? undefined : packed);
    return;
  }
  res.setHeader('Content-Length', info.size);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

const service = new QuizService({ env: process.env });
const api = createQuizHandler(service);

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/health') return sendJson(res, 200, { ok: true });
  api(req, res, () => {
    serveStatic(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.destroy();
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  const status = service.status();
  console.log(
    `Костры: http://0.0.0.0:${port} — генерация ${status.generationConfigured ? 'подключена' : 'без ключа (AITUNNEL_API_KEY)'}, озвучка ${status.ttsConfigured ? 'подключена' : 'без ключа'}`,
  );
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
