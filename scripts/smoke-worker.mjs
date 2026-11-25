import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import {loadLocalCatalog} from '../lib/local-catalog-seed.js';
import worker from '../dist/server/index.js';
import {seedTestCatalog} from '../tests/helpers/catalog-fixture.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON;');
for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
await loadLocalCatalog(sqlite);
// Catalog data is loaded separately from schema migrations, as in production.
const usingSyntheticCatalog=sqlite.prepare('SELECT COUNT(*) AS n FROM question_catalog').get().n===0;
if(usingSyntheticCatalog)seedTestCatalog(sqlite);
const env = { DB: { prepare(sql) { return { bind(...params) { return {
  async all() { return { results: sqlite.prepare(sql).all(...params) }; },
  async run() { return sqlite.prepare(sql).run(...params); }
}; } }; } } };
const device = 'hoehenflug-worker-smoke-12345';
async function call(path, body) {
  const request = new Request('https://hoehenflug.test' + path + (body ? '' : (path.includes('?') ? '&' : '?') + 'device=' + device), body ? { method: 'POST', body: JSON.stringify({ device, ...body }) } : {});
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  return response;
}
assert.match((await call('/')).headers.get('content-type'), /html/);
const catalog=await (await call('/api/catalog')).json();
assert.ok(catalog.questions>0&&catalog.families>0);
assert.equal('question' in catalog,false);
let flight = await (await call('/api/start', { mode: 'mix' })).json();
assert.equal(flight.status, 'ready');
assert.equal(flight.question, null);
assert.equal(flight.timeLimitMs, 22000);
for (let index = 0; index < 4; index++) {
  flight = await (await call('/api/next', { runId: flight.id })).json();
  assert.equal(flight.status, 'flying');
  assert.ok(flight.question.options.every(option => option.value === undefined && option.displayValue === undefined));
  const question = JSON.parse(sqlite.prepare('SELECT question_json FROM runs WHERE id = ?').get(flight.id).question_json);
  flight = await (await call('/api/answer', { runId: flight.id, questionId: question.id, questionIndex: flight.index, choiceId: question.correctId })).json();
}
assert.equal(flight.streak, 4);
assert.ok(flight.altitude >= 600 && flight.altitude <= 2000);
flight = await (await call('/api/next', { runId: flight.id })).json();
flight = await (await call('/api/answer', { runId: flight.id, questionId: flight.question.id, questionIndex: flight.index, choiceId: null, expired: true })).json();
assert.equal(flight.status, 'ready');
assert.equal(flight.danger, 1);
assert.equal(flight.result.points, 0);
assert.equal((await (await call('/api/run?id=' + flight.id)).json()).correctTotal, 4);
flight = await (await call('/api/next', { runId: flight.id })).json();
const rescue = JSON.parse(sqlite.prepare('SELECT question_json FROM runs WHERE id = ?').get(flight.id).question_json);
flight = await (await call('/api/answer', { runId: flight.id, questionId: flight.question.id, questionIndex: flight.index, choiceId: rescue.correctId })).json();
assert.equal(flight.result.rescued, true);
for (let error = 0; error < 3; error++) {
  flight = await (await call('/api/next', { runId: flight.id })).json();
  flight = await (await call('/api/answer', { runId: flight.id, questionId: flight.question.id, questionIndex: flight.index, choiceId: null, expired: true })).json();
}
assert.equal(flight.status, 'crashed');
assert.equal(flight.altitude, 0);
assert.ok(flight.peakAltitude > 0);
assert.equal((await (await call('/api/stats')).json()).bestStreak, 4);
assert.equal((await (await call('/api/history')).json()).flights.length, 1);
let daily = await (await call('/api/start', { mode: 'daily' })).json();
assert.equal(daily.altitude, 1500);
assert.equal(daily.timeLimitMs, 25000);
assert.equal((await (await call('/api/start', { mode: 'daily' })).json()).id, daily.id);
for (let error = 0; error < 10; error++) {
  daily = await (await call('/api/next', { runId: daily.id })).json();
  assert.equal(daily.timeLimitMs, 25000);
  daily = await (await call('/api/answer', { runId: daily.id, questionId: daily.question.id, questionIndex: daily.index, choiceId: null, expired: true })).json();
}
assert.equal(daily.status, 'finished');
assert.equal(daily.index, 10);
assert.equal(daily.completed, true);
assert.equal(daily.altitude, 0);
assert.equal((await (await call('/api/start', { mode: 'daily' })).json()).id, daily.id);
assert.equal((await (await call('/api/next', { runId: daily.id })).json()).status, 'finished');
assert.equal((await (await call('/api/leaderboard')).json()).own.rank, 1);
assert.equal((await (await call('/api/profile', { name: 'Smoke Pilot' })).json()).name, 'Smoke Pilot');
assert.equal((await (await call('/api/leaderboard')).json()).own.name, 'Smoke Pilot');
assert.equal((await (await call('/api/daily')).json()).available, false);
assert.equal((await (await call('/api/stats')).json()).byMode.daily.flights, 1);
await call('/api/delete', {});
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 0);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM pilots').get().n, 0);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE device=?').get(device).n,0);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seen_question_backfills WHERE device=?').get(device).n,0);
assert.equal((await (await call('/api/leaderboard')).json()).totalFinished, 0);
sqlite.close();
console.log('Worker smoke test passed ('+(usingSyntheticCatalog?'synthetic mechanics fixture':'imported catalog')+'): permanent reservations, frozen questions, rewards, rescue, ten-question daily competition, leaderboard, profiles, stats, history and deletion.');
