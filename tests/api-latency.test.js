import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAPI } from '../lib/api.js';
import { applyTestSchema, seedTestCatalog } from './helpers/catalog-fixture.js';

function fixture({ afterRead } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  applyTestSchema(sqlite);
  seedTestCatalog(sqlite);
  let trace = [];
  const api = createAPI({
    all: async (sql, params) => { trace.push(sql); const rows=sqlite.prepare(sql).all(...params); await afterRead?.(sql,params); return rows; },
    run: async (sql, params) => { trace.push(sql); return sqlite.prepare(sql).run(...params); }
  });
  const device = 'latency-budget-device-123456';
  return { sqlite, device, async call(path, body, asDevice = device) {
    trace = [];
    const response = await api(new Request('https://flight.test/api/' + path + (body ? '' : (path.includes('?') ? '&' : '?') + 'device=' + asDevice), body ? {
      method: 'POST', body: JSON.stringify({ device: asDevice, ...body })
    } : {}));
    assert.equal(response.status, 200);
    return { ...await response.json(), queries: [...trace] };
  } };
}

function answer(f, flight) {
  const full = JSON.parse(f.sqlite.prepare('SELECT question_json FROM runs WHERE id=?').get(flight.id).question_json);
  return f.call('answer', { runId: flight.id, questionId: full.id, questionIndex: flight.index, choiceId: full.correctId });
}

test('ordinary flight transitions have bounded DB roundtrips without pre-arming or exposing another answer', async () => {
  const f = fixture();
  try {
    for (const mode of ['mix', 'daily']) {
      const fresh = await f.call('start', { mode });
      let flight = await f.call('next', { runId: fresh.id });
      const result = await answer(f, flight);
      assert.match(result.queries[0], /^INSERT OR IGNORE INTO answers/, 'receipt must be claimed before any asynchronous DB read');
      assert.ok(result.queries.length <= (mode === 'daily' ? 14 : 13), 'answer roundtrip budget: ' + result.queries.length);
      assert.equal(result.result.correct, true);
      assert.equal(result.question, null);
      assert.equal(result.deadline, null);
      const waiting = f.sqlite.prepare('SELECT status,question_json,deadline FROM runs WHERE id=?').get(fresh.id);
      assert.equal(waiting.status, 'ready');
      assert.equal(waiting.question_json, null);
      assert.equal(waiting.deadline, null);

      flight = await f.call('next', { runId: fresh.id });
      // Leave room for a selection-key wrap while catching the former 21/19
      // calls per free/daily transition. Counts include every read and write.
      assert.ok(flight.queries.length <= (mode === 'daily' ? 12 : 15), 'next roundtrip budget: ' + flight.queries.length);
      assert.equal(flight.question.correctId, undefined);
      assert.equal(flight.index, 1);
      const resumed = await f.call('run?id=' + fresh.id);
      assert.ok(resumed.queries.length <= (mode === 'daily' ? 8 : 7), 'resume roundtrip budget: ' + resumed.queries.length);
      assert.equal(resumed.deadline, flight.deadline);
      assert.deepEqual(resumed.question, flight.question);
      if (mode === 'daily') {
        const info = await f.call('daily');
        assert.ok(info.queries.length <= 8, 'daily home roundtrip budget: ' + info.queries.length);
        assert.equal(info.attempt.id, fresh.id);
        assert.equal(info.attempt.deadline, flight.deadline);
      }
    }
  } finally { f.sqlite.close(); }
});

test('a reused API observes new profiles and imported catalog versions on each request', async () => {
  const f = fixture();
  try {
    const fresh = await f.call('start', { mode: 'mix' });
    const flight = await f.call('next', { runId: fresh.id });
    const originalQuestion = flight.question;
    const otherDevice = 'latency-separate-device-1234';
    await f.call('profile', { name: 'Mila' });
    await f.call('profile', { name: 'Toni' }, otherDevice);
    f.sqlite.prepare("UPDATE question_catalog_meta SET value='test-fixture-v2' WHERE key='version'").run();
    const resumed = await f.call('run?id=' + fresh.id);
    assert.equal(resumed.pilotName, 'Mila');
    assert.equal((await f.call('profile', null, otherDevice)).name, 'Toni');
    assert.equal(f.sqlite.prepare('SELECT catalog_version FROM seen_question_backfills WHERE device=?').get(f.device).catalog_version, 'test-fixture-v2');
    assert.deepEqual(resumed.question, originalQuestion);
    assert.equal(resumed.deadline, flight.deadline);
    assert.equal((await answer(f, resumed)).result.correct, true);
  } finally { f.sqlite.close(); }
});

test('a parallel reservation of the last available family is recovered instead of ending the flight', async () => {
  let claimed = false, runId;
  const f = fixture({ afterRead(sql) {
    if (!claimed && sql.startsWith('SELECT c.category FROM seen_questions')) {
      claimed = true;
      const last = f.sqlite.prepare('SELECT id,family_id FROM question_catalog WHERE enabled=1').get();
      f.sqlite.prepare('INSERT INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position) VALUES(?,?,?,?,?,0)').run(f.device,last.family_id,last.id,Date.now(),runId);
    }
  } });
  try {
    f.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE id<>'fixture:free:quantity:0:common'").run();
    const fresh = await f.call('start', { mode: 'common' });
    runId = fresh.id;
    const flight = await f.call('next', { runId });
    assert.equal(claimed, true);
    assert.equal(flight.status, 'flying');
    assert.equal(flight.question.id, 'fixture:free:quantity:0:common');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE run_id=?').get(runId).n, 1);
    assert.equal((await answer(f,flight)).result.correct, true);
  } finally { f.sqlite.close(); }
});
