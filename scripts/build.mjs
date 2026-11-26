import { readFile, writeFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { resolve, dirname, relative, extname } from 'node:path';

// Scope each small ESM module before concatenating: no bundler dependency needed.
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'server'), { recursive: true });
await mkdir(resolve(output, '.openai'), { recursive: true });
const visited = new Set();
async function bundle(path) {
  path = resolve(path);
  if (visited.has(path)) return '';
  visited.add(path);
  let source = await readFile(path, 'utf8');
  const exported = [...source.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map(item => item[1]);
  let dependencies = '';
  for (const item of source.matchAll(/^import\s+[\s\S]*?from\s+['"](.+?)['"];?\s*$/gm)) {
    if (!item[1].startsWith('.')) throw new Error(`Unsupported build import: ${item[1]}`);
    dependencies += await bundle(resolve(dirname(path), item[1]));
  }
  source = source.replace(/^import\s+[\s\S]*?from\s+['"].+?['"];?\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class|async function)\b)/g, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  return dependencies + '\n// ' + relative(root, path) + '\nconst { ' + exported.join(', ') + ' } = (() => {\n' + source + '\nreturn { ' + exported.join(', ') + ' };\n})();\n';
}
const apiSource = await bundle(resolve(root, 'lib/api.js'));
const catalogImportSource = await bundle(resolve(root, 'lib/catalog-import.js'));
const releaseSource = await bundle(resolve(root, 'lib/catalog-release.js'));
// A small trusted content release is embedded server-side and installed once
// in the existing D1 database. No client can supply rows to this path.
const catalogLines=(await readFile(resolve(root,'content/catalog-import.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const schoolBatches=catalogLines.map(batch=>({...batch,rows:batch.rows.filter(row=>batch.table==='question_fact_families'?(row.fact_key?.startsWith('school:')||row.fact_key?.startsWith('curated:')):batch.table==='question_catalog'?(row.id?.startsWith('school-')||row.id?.startsWith('curated-')):batch.table==='question_family_aliases'?(row.family_id?.startsWith('school:')||row.family_id?.startsWith('curated:')):batch.table==='question_catalog_meta')})).filter(batch=>batch.rows.length);
const schoolVersion=schoolBatches.find(batch=>batch.table==='question_catalog_meta')?.rows.find(row=>row.key==='version')?.value;
const catalogRelease={id:schoolVersion,batches:schoolBatches};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
const assets = {};
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await collect(path);
    else assets['/' + relative(resolve(root, 'public'), path)] = { type: types[extname(path)] || 'application/octet-stream', base64: (await readFile(path)).toString('base64') };
  }
}
await collect(resolve(root, 'public'));
if (!assets['/index.html']) throw new Error('public/index.html is missing');
const worker = apiSource + catalogImportSource + releaseSource + `
const embeddedAssets = ${JSON.stringify(assets)};
const embeddedCatalogRelease = ${JSON.stringify(catalogRelease)};
const installingCatalog = new WeakMap();
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/catalog/import') {
      const importer = createCatalogImport({ batch: entries => env.DB.batch(entries.map(({sql,params}) => env.DB.prepare(sql).bind(...params))) }, { token: env.CATALOG_IMPORT_TOKEN });
      if (env.CATALOG_IMPORT_TOKEN && !env.DB) return new Response('Database unavailable', { status: 503 });
      return importer(request);
    }
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return new Response(JSON.stringify({ error: 'Der Spielspeicher ist gerade nicht erreichbar.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      const db={
        all: async (sql, params) => (await env.DB.prepare(sql).bind(...params).all()).results,
        run: async (sql, params) => env.DB.prepare(sql).bind(...params).run(),
        batch: entries => env.DB.batch(entries.map(({sql,params})=>env.DB.prepare(sql).bind(...params)))
      };
      if (request.method !== 'OPTIONS' && embeddedCatalogRelease.id && embeddedCatalogRelease.batches.some(batch=>batch.table==='question_catalog')) {
        let pending=installingCatalog.get(env.DB);
        if(!pending){pending=installCatalogRelease(db,embeddedCatalogRelease);installingCatalog.set(env.DB,pending);pending.catch(()=>installingCatalog.delete(env.DB));}
        await pending;
      }
      const api = createAPI(db);
      return api(request);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const asset = embeddedAssets[url.pathname] || (!url.pathname.split('/').pop().includes('.') ? embeddedAssets['/index.html'] : null);
    if (!asset) return new Response('Not found', { status: 404 });
    const binary = atob(asset.base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': asset.type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300' } });
  }
};
`;
await writeFile(resolve(output, 'server/index.js'), worker);
// Portable builds do not need a hosting account. Include Sites identity only
// when the owner explicitly configures their own project in this checkout.
let hosting = null;
try { hosting = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (hosting) {
  if (!hosting.project_id || hosting.d1 !== 'DB') throw new Error('Configure your own Site project and the string d1:"DB" in .openai/hosting.json.');
  await writeFile(resolve(output, '.openai/hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
}
await cp(resolve(root, 'drizzle'), resolve(output, 'drizzle'), { recursive: true });
await cp(resolve(root, 'drizzle'), resolve(output, 'server/drizzle'), { recursive: true });
console.log(`Built Höhenflug Worker with ${Object.keys(assets).length} assets (${Math.round(Buffer.byteLength(worker) / 1024)} KB). Include drizzle/ at the archive root.`);
