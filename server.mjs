import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAPI } from './lib/api.js';

const dataPath = resolve(process.env.DIVE_DATA_DIR || './data');
await mkdir(dataPath, { recursive: true });
const sqlite = new DatabaseSync(resolve(dataPath, 'hoehenflug.sqlite'));
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// Local migration bookkeeping is startup-only. The original idempotent schema
// safely adopts older installations that predate this migration ledger.
sqlite.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY);');
for (const name of (await readdir(new URL('./migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
  if (sqlite.prepare('SELECT name FROM __local_migrations WHERE name = ?').get(name)) continue;
  sqlite.exec('BEGIN;');
  try {
    sqlite.exec(await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8'));
    sqlite.prepare('INSERT INTO __local_migrations(name) VALUES(?)').run(name);
    sqlite.exec('COMMIT;');
  } catch (error) { sqlite.exec('ROLLBACK;'); throw error; }
}
const api = createAPI({ all: async (sql, params) => sqlite.prepare(sql).all(...params), run: async (sql, params) => sqlite.prepare(sql).run(...params) });
const publicRoot = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      let data = '';
      for await (const part of req) {
        data += part;
        if (data.length > 4096) { res.writeHead(413); res.end(); return; }
      }
      const response = await api(new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: data } : {}) }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    let path;
    try { path = resolve(publicRoot, '.' + decodeURIComponent(url.pathname)); } catch { res.writeHead(400); res.end(); return; }
    if (path !== publicRoot && !path.startsWith(publicRoot + '/')) { res.writeHead(403); res.end(); return; }
    if (!extname(path)) path = resolve(publicRoot, 'index.html');
    const file = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const portArg = process.argv.indexOf('--port');
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Höhenflug is running on port ${port}`));
