import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAPI } from '../lib/api.js';
import { applyTestSchema, seedTestCatalog } from './helpers/catalog-fixture.js';

const origin = 'https://foratstefan-design.github.io';
const device = 'pages-cors-test-device-12345';
const request = (path, options = {}) => new Request('https://flight.test/api/' + path, options);
const assertAllowed = response => {
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
};

test('Pages JSON preflight succeeds without a device or database access', async () => {
  const api = createAPI({ all: () => assert.fail('Preflight must not read state'), run: () => assert.fail('Preflight must not write state') });
  for (const method of ['GET', 'POST']) {
    const response = await api(request('answer', { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'Content-Type'
    } }));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assertAllowed(response);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST');
    assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  }
});

test('CORS does not permit other origins, extra request headers, methods, or admin import', async () => {
  const api = createAPI({ all: () => assert.fail('Rejected preflight must not read state'), run: () => assert.fail('Rejected preflight must not write state') });
  for (const otherOrigin of ['https://other.github.io', origin + '.example.test', 'null']) {
    const response = await api(request('start', { method: 'OPTIONS', headers: { Origin: otherOrigin, 'Access-Control-Request-Method': 'POST' } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  for (const changes of [
    { 'Access-Control-Request-Method': 'DELETE' },
    { 'Access-Control-Request-Headers': 'content-type, authorization' }
  ]) {
    const response = await api(request('start', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', ...changes } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), null);
  }
  for (const path of ['admin/catalog/import', 'unknown']) {
    const response = await api(request(path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } }));
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), null);
  }
});

test('Pages can play against server state and read both validation and missing-run errors', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  applyTestSchema(sqlite);
  seedTestCatalog(sqlite);
  const api = createAPI({ all: async (sql, params) => sqlite.prepare(sql).all(...params), run: async (sql, params) => sqlite.prepare(sql).run(...params) });
  const post = (path, body) => api(request(path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ device, ...body }) }));
  try {
    const freshResponse = await post('start', { mode: 'mix' });
    assert.equal(freshResponse.status, 200);
    assertAllowed(freshResponse);
    const fresh = await freshResponse.json();
    const nextResponse = await post('next', { runId: fresh.id });
    assertAllowed(nextResponse);
    const flight = await nextResponse.json();
    assert.ok(flight.question);
    const full = JSON.parse(sqlite.prepare('SELECT question_json FROM runs WHERE id=?').get(fresh.id).question_json);
    const answerResponse = await post('answer', { runId: fresh.id, questionId: flight.question.id, questionIndex: flight.index, choiceId: full.correctId });
    assertAllowed(answerResponse);
    assert.equal((await answerResponse.json()).result.correct, true);
    const missing = await api(request('run?id=missing&device=' + device, { headers: { Origin: origin } }));
    assert.equal(missing.status, 404);
    assertAllowed(missing);
    const invalid = await api(request('start', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' }));
    assert.equal(invalid.status, 400);
    assertAllowed(invalid);
    const noDevice = await api(request('profile', { headers: { Origin: origin } }));
    assert.equal(noDevice.status, 400);
    assertAllowed(noDevice);
    const sameOrigin = await api(request('profile?device=' + device));
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get('Access-Control-Allow-Origin'), null);
    const otherOrigin = await api(request('profile?device=' + device, { headers: { Origin: 'https://other.github.io' } }));
    assert.equal(otherOrigin.headers.get('Access-Control-Allow-Origin'), null);
  } finally {
    sqlite.close();
  }
});
