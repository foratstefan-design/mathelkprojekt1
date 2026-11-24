import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createAPI } from '../lib/api.js';
import { timeLimitMs, dailyModeFor, dailyQuestionFor } from '../lib/engine.js';
import { legacyQuestionFor } from '../lib/legacy-engine.js';

function fixture({ afterWrite } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  const api = createAPI({
    all: async (sql, params) => sqlite.prepare(sql).all(...params),
    run: async (sql, params) => { const result = sqlite.prepare(sql).run(...params); await afterWrite?.(sql, params); return result; }
  });
  const device = 'hoehenflug-test-device-12345';
  return { sqlite, device, call: async (path, body, asDevice = device) => {
    const response = await api(new Request('https://flight.test/api/' + path + (!body ? (path.includes('?') ? '&' : '?') + 'device=' + asDevice : ''), body ? { method: 'POST', body: JSON.stringify({ device: asDevice, ...body }) } : {}));
    return { httpStatus: response.status, ...await response.json() };
  } };
}
const q = (f, flight) => JSON.parse(f.sqlite.prepare('SELECT question_json FROM runs WHERE id = ?').get(flight.id).question_json);
const post = (flight, choiceId, extra = {}) => ({ runId: flight.id, questionId: flight.question.id, questionIndex: flight.index, choiceId, ...extra });
async function start(f, mode = 'mix') { const fresh = await f.call('start', { mode }); return f.call('next', { runId: fresh.id }); }
async function right(f, flight) { return f.call('answer', post(flight, q(f, flight).correctId)); }
async function wrong(f, flight) { const full = q(f, flight); return f.call('answer', post(flight, full.options.find(option => option.id !== full.correctId).id)); }

 test('new practice flights hide future answers, persist their question, and never extend an active timer', async () => {
  const f = fixture();
  try {
    const a = await f.call('start', { mode: 'mix' }), b = await f.call('start', { mode: 'mix' });
    assert.notEqual(a.id, b.id); assert.equal(a.kind, 'free'); assert.equal(a.question, null); assert.equal(a.deadline, null); assert.equal(a.timeLimitMs, 22000);
    const before = Date.now(); const flying = await f.call('next', { runId: a.id });
    assert.ok(flying.deadline >= before + 22000 && flying.deadline <= Date.now() + 22000);
    assert.equal(flying.question.options.length, 4); assert.equal(flying.question.correctId, undefined); assert.equal(flying.question.source, undefined);
    assert.ok(flying.question.options.every(option => option.value === undefined && option.displayValue === undefined));
    assert.ok(f.sqlite.prepare('SELECT question_json FROM runs WHERE id = ?').get(a.id).question_json);
    assert.deepEqual((await f.call('run?id=' + a.id)).question, flying.question);
    assert.equal((await f.call('next', { runId: a.id })).deadline, flying.deadline);
  } finally { f.sqlite.close(); }
});

test('two consecutive practice errors survive at ground level; a third crashes and cannot restart', async () => {
  const f = fixture();
  try {
    let flight = await start(f);
    for (let danger = 1; danger <= 3; danger++) {
      const result = await wrong(f, flight);
      assert.equal(result.danger, danger); assert.equal(result.result.danger, danger); assert.equal(result.altitude, 0); assert.equal(result.streak, 0); assert.equal(result.result.points, 0);
      assert.equal(result.result.survived, danger < 3); assert.equal(result.status, danger < 3 ? 'ready' : 'crashed');
      if (danger < 3) { assert.equal(result.recovering, true); flight = await f.call('next', { runId: result.id }); }
      else { assert.equal((await f.call('next', { runId: result.id })).status, 'crashed'); assert.ok(result.finishedAt); }
    }
  } finally { f.sqlite.close(); }
});

test('a correct rescue clears danger; errors reset consecutive streak but preserve total progress and peak', async () => {
  const f = fixture();
  try {
    let flight = await start(f); let result = await right(f, flight);
    const firstPeak = result.peakAltitude;
    flight = await f.call('next', { runId: result.id }); result = await wrong(f, flight);
    assert.equal(result.result.altitudeLoss, Math.min(250, firstPeak)); assert.equal(result.streak, 0); assert.equal(result.correctTotal, 1); assert.equal(result.peakAltitude, firstPeak);
    assert.equal(result.timeLimitMs, timeLimitMs(1, { recovering: true, daily: false }));
    flight = await f.call('next', { runId: result.id }); result = await right(f, flight);
    assert.equal(result.result.rescued, true); assert.equal(result.danger, 0); assert.equal(result.correctTotal, 2); assert.equal(result.streak, 1);
    assert.equal(result.timeLimitMs, timeLimitMs(2, { recovering: false, daily: false }));
    for (let index = 0; index < 3; index++) { flight = await f.call('next', { runId: result.id }); result = await wrong(f, flight); }
    assert.equal(result.status, 'crashed'); assert.equal(result.altitude, 0); assert.ok(result.peakAltitude > 0);
    const stats = await f.call('stats'); assert.equal(stats.totalCorrect, 2); assert.equal(stats.bestAltitude, result.peakAltitude); assert.equal(stats.bestStreak, 1);
    assert.equal((await f.call('history')).flights[0].peakAltitude, result.peakAltitude);
  } finally { f.sqlite.close(); }
});

test('daily competition has one fixed ten-question attempt, equal questions and windows, and never ends early at zero', async () => {
  const f = fixture(); const secondDevice = 'another-test-device-1234567';
  try {
    const day = await f.call('daily');
    assert.equal(day.available, true); assert.equal(day.questionCount, 10); assert.equal(day.mode, dailyModeFor(day.date)); assert.equal(day.profile.name.startsWith('Pilot-'), true);
    const [a, b] = await Promise.all([f.call('start', { mode: 'daily' }), f.call('start', { mode: 'daily' })]);
    assert.equal(a.id, b.id); assert.equal(a.mode, 'daily'); assert.equal(a.dailyMode, day.mode); assert.equal(a.competitionVersion, 3); assert.equal(a.questionCount, 10); assert.equal(a.altitude, 1500); assert.equal(a.timeLimitMs, 25000);
    const other = await f.call('start', { mode: 'daily' }, secondDevice);
    let result, otherResult;
    const ids = new Set(), families = new Set();
    for (let index = 0; index < 10; index++) {
      const flying = await f.call('next', { runId: a.id });
      const otherFlying = await f.call('next', { runId: other.id }, secondDevice);
      assert.deepEqual(flying.question, otherFlying.question, 'everyone sees the same question irrespective of previous results');
      assert.equal(flying.timeLimitMs, otherFlying.timeLimitMs); assert.equal(flying.timeLimitMs, timeLimitMs(index, { daily: true }));
      assert.equal(flying.question.type, day.mode);
      const full = q(f, flying); assert.equal(ids.has(full.id), false); assert.equal(families.has(full.familyId), false); ids.add(full.id); families.add(full.familyId);
      result = await wrong(f, flying);
      otherResult = await f.call('answer', post(otherFlying, q(f, otherFlying).correctId), secondDevice);
      assert.equal(result.altitude, Math.max(0, 1500 - (index + 1) * 350)); assert.equal(result.danger, 0); assert.equal(result.result.survived, true);
      assert.equal(result.status, index < 9 ? 'ready' : 'finished'); assert.equal(result.index, index + 1); assert.equal(result.completed, index === 9);
      if (index < 9) assert.equal((await f.call('leaderboard')).totalFinished, 0);
    }
    assert.equal(result.crashReason, null); assert.equal(result.timeLimitMs,timeLimitMs(9,{daily:true})); assert.equal(result.resultCount, 10); assert.ok(result.finishedAt); assert.equal(otherResult.status, 'finished');
    const repeated = await f.call('answer', { runId: a.id, questionIndex: 9, questionId: result.latestResult.questionId, choiceId: result.latestResult.correctId });
    assert.deepEqual(repeated.result, result.latestResult); assert.equal(repeated.resultCount, 10);
    assert.equal((await f.call('next', { runId: a.id })).status, 'finished'); assert.equal((await f.call('start', { mode: 'daily' })).id, a.id);
    const done = await f.call('daily'); assert.equal(done.available, false); assert.equal(done.attempt.completed, true);
    const board = await f.call('leaderboard'); assert.equal(board.totalFinished, 2); assert.equal(board.own.rank, 2); assert.equal(board.own.altitude, 0); assert.equal(board.entries[0].altitude, otherResult.altitude);
    const stats = await f.call('stats'); assert.equal(stats.daily.completed, 1); assert.equal(stats.daily.crashes, 0); assert.equal(stats.free.flights, 0);
    const history = await f.call('history'); assert.equal(history.flights[0].status, 'finished'); assert.equal(history.flights[0].dailyMode, day.mode); assert.equal(history.flights[0].questionCount, 10);
  } finally { f.sqlite.close(); }
});

test('daily rotation follows rare, common, earlier, later on successive Berlin days', async () => {
  const f = fixture(); const realNow = Date.now;
  try {
    for (const [date, expected] of [['2026-11-19','rare'], ['2026-11-20','common'], ['2026-11-21','earlier'], ['2026-11-22','later'], ['2026-11-23','rare']]) {
      Date.now = () => Date.parse(date + 'T12:00:00Z');
      const day = await f.call('daily'); const run = await f.call('start', { mode: 'daily' });
      assert.equal(day.mode, expected); assert.equal(run.dailyMode, expected); assert.equal(day.label.length > 0, true);
    }
  } finally { Date.now = realNow; f.sqlite.close(); }
});

test('daily day keys change at midnight in Berlin, not at UTC midnight', async () => {
  const f = fixture(); const realNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-11-19T22:59:59Z');
    const a = await f.call('start', { mode: 'daily' }); assert.equal(a.dailyDate, '2026-11-19');
    Date.now = () => Date.parse('2026-11-19T23:00:01Z');
    const b = await f.call('start', { mode: 'daily' }); assert.equal(b.dailyDate, '2026-11-20'); assert.notEqual(a.id, b.id);
    assert.equal((await f.call('start', { mode: 'daily' })).id, b.id);
    Date.now = () => Date.parse('2026-07-19T21:59:59Z');
    const summerA = await f.call('start', { mode: 'daily' }); assert.equal(summerA.dailyDate, '2026-07-19');
    Date.now = () => Date.parse('2026-07-19T22:00:01Z');
    const summerB = await f.call('start', { mode: 'daily' }); assert.equal(summerB.dailyDate, '2026-07-20'); assert.notEqual(summerA.id, summerB.id);
  } finally { Date.now = realNow; f.sqlite.close(); }
});

test('no question or family repeats; the first questions are entry level and the state history stays bounded', async () => {
  const f = fixture();
  try {
    let flight = await start(f, 'common'); const ids = new Set(), families = new Set();
    for (let index = 0; index < 52; index++) {
      const full = q(f, flight); assert.equal(ids.has(full.id), false); assert.equal(families.has(full.familyId), false); ids.add(full.id); families.add(full.familyId);
      if (index < 4) assert.equal(full.difficulty, 1);
      const result = await right(f, flight); assert.ok(result.result.points >= 10 && result.result.points <= 30); assert.ok(result.result.altitudeGain >= 150 && result.result.altitudeGain <= 500);
      flight = await f.call('next', { runId: result.id });
    }
    assert.equal(flight.correctTotal, 52); assert.equal(flight.timeLimitMs, timeLimitMs(52)); assert.equal(flight.results.length, 20); assert.equal(flight.resultCount, 52); assert.equal(flight.latestResult.questionIndex, 51);
    const failed = await f.call('answer', post(flight, null, { expired: true })); assert.equal(failed.status, 'ready'); assert.equal(failed.results.length, 20); assert.equal(failed.resultCount, 53); assert.equal(failed.latestResult.correct, false);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM answers WHERE run_id = ?').get(flight.id).n, 53);
  } finally { f.sqlite.close(); }
});

test('new free flights prefer unused families from the same device, including inverse questions, without leaking another device history', async () => {
  const f=fixture();
  try {
    const first=await f.call('start',{mode:'common'});
    f.sqlite.prepare('UPDATE runs SET seed = ? WHERE id = ?').run('shared-free-history-seed',first.id);
    const flying=await f.call('next',{runId:first.id}); const original=q(f,flying);
    await right(f,flying);
    const next=await f.call('start',{mode:'common'});
    f.sqlite.prepare('UPDATE runs SET seed = ? WHERE id = ?').run('shared-free-history-seed',next.id);
    const fresh=await f.call('next',{runId:next.id});
    assert.notEqual(fresh.question.familyId,original.familyId);assert.equal(fresh.question.difficulty,1);
    const reverse=await f.call('start',{mode:'rare'});
    f.sqlite.prepare('UPDATE runs SET seed = ? WHERE id = ?').run('shared-free-history-seed',reverse.id);
    const inverse=await f.call('next',{runId:reverse.id});
    assert.notEqual(inverse.question.familyId,original.familyId);
    const otherDevice='unseen-free-history-device-123';
    const untouched=await f.call('start',{mode:'common'},otherDevice);
    f.sqlite.prepare('UPDATE runs SET seed = ? WHERE id = ?').run('shared-free-history-seed',untouched.id);
    const peer=await f.call('next',{runId:untouched.id},otherDevice);
    assert.equal(peer.question.familyId,original.familyId,'a different device starts its own history');
    const dailyA=await f.call('start',{mode:'daily'}),dailyB=await f.call('start',{mode:'daily'},otherDevice);
    assert.deepEqual((await f.call('next',{runId:dailyA.id})).question,(await f.call('next',{runId:dailyB.id},otherDevice)).question,'daily competition stays common to everyone');
  } finally { f.sqlite.close(); }
});

test('armed question JSON freezes labels, correct answer and time despite later selection context changes', async () => {
  const f = fixture();
  try {
    const flight = await start(f); const full = q(f, flight);
    f.sqlite.prepare('UPDATE runs SET seed = ?, altitude = ?, correct_total = ? WHERE id = ?').run('a-different-content-seed', 9000, 80, flight.id);
    const resumed = await f.call('run?id=' + flight.id); assert.equal(resumed.question.id, full.id); assert.equal(resumed.timeLimitMs, full._limitMs);
    assert.deepEqual(resumed.question.options.map(option => option.id).sort(), full.options.map(option => option.id).sort());
    const result = await f.call('answer', post(resumed, full.correctId)); assert.equal(result.result.correct, true); assert.equal(result.result.questionId, full.id);
  } finally { f.sqlite.close(); }
});

test('concurrent submissions keep the first choice once; invalid choices do not consume a task', async () => {
  const f = fixture();
  try {
    const flight = await start(f); const full = q(f, flight);
    const invalid = await f.call('answer', post(flight, 'alien')); assert.equal(invalid.httpStatus, 400); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM answers').get().n, 0);
    const bad = full.options.find(option => option.id !== full.correctId).id;
    const [a, b] = await Promise.all([f.call('answer', post(flight, full.correctId)), f.call('answer', post(flight, bad))]);
    assert.deepEqual(a.result, b.result); assert.equal(a.correctTotal, 1); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM answers').get().n, 1);
    const old = await f.call('answer', post(flight, bad)); assert.equal(old.result.correct, true); assert.equal(old.index, 1);
    assert.equal((await f.call('next', { runId: flight.id, device: 'another-valid-device-12345' })).httpStatus, 404);
  } finally { f.sqlite.close(); }
});

test('timely receipt beats a racing expiry read, while unattended timeout consumes exactly one recovery chance', async () => {
  let release, markClaimed; const claimed = new Promise(resolve => { markClaimed = resolve; }); const hold = new Promise(resolve => { release = resolve; }); let block = false;
  const f = fixture({ afterWrite: async (sql, params) => { if (block && sql.startsWith('INSERT OR IGNORE INTO answers') && String(params[5]).includes('checking')) { markClaimed(); await hold; } } });
  const realNow = Date.now;
  try {
    const flight = await start(f); const full = q(f, flight); Date.now = () => flight.deadline - 10; block = true;
    const timely = f.call('answer', post(flight, full.correctId)); await claimed; Date.now = () => flight.deadline + 1000;
    const racing = await f.call('run?id=' + flight.id); assert.equal(racing.latestResult.correct, true); assert.equal(racing.latestResult.timedOut, false); release(); assert.equal((await timely).correctTotal, 1);
    Date.now = realNow; block = false;
    const active = await f.call('next', { runId: flight.id }); f.sqlite.prepare('UPDATE runs SET deadline = ? WHERE id = ?').run(Date.now() - 1000, active.id);
    const expired = await f.call('run?id=' + active.id); assert.equal(expired.status, 'ready'); assert.equal(expired.danger, 1); assert.equal(expired.latestResult.timedOut, true);
    assert.equal((await f.call('run?id=' + active.id)).danger, 1);
  } finally { release(); Date.now = realNow; f.sqlite.close(); }
});

test('legacy migration preserves old records and the exact previously armed question until it is graded', async () => {
  const f = fixture();
  try {
    const id = 'legacy-run-12345678', seed = 'legacy-fixed-seed';
    f.sqlite.prepare('INSERT INTO runs(id,device,mode,seed,status,question_index,streak,score,altitude,deadline,started_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, f.device, 'mix', seed, 'flying', 2, 2, 60, 850, Date.now() + 10000, Date.now());
    const old = legacyQuestionFor(seed, 2, 'mix'); const resumed = await f.call('run?id=' + id);
    assert.equal(resumed.question.id, old.id); assert.equal(resumed.timeLimitMs, 13100); assert.equal(resumed.correctTotal, 2); assert.equal(resumed.peakAltitude, 850);
    const result = await f.call('answer', post(resumed, old.correctId)); assert.equal(result.result.correct, true); assert.equal(result.correctTotal, 3); assert.equal(result.status, 'ready');
    f.sqlite.prepare('INSERT INTO runs(id,device,mode,seed,status,streak,score,altitude,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy-ended', f.device, 'mix', 'old', 'crashed', 6, 150, 5000, Date.now(), Date.now());
    const stats = await f.call('stats'); assert.equal(stats.bestAltitude, 5000); assert.equal(stats.totalCorrect, 9);
    await f.call('delete', {}); assert.equal((await f.call('stats')).flights, 0); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM answers').get().n, 0);
  } finally { f.sqlite.close(); }
});

function insertRanked(f, { id, device, day, altitude = 2000, score = 100, elapsed = 1000, started = 1000, status = 'finished', version = 3, index = 10, mode = 'rare' }) {
  f.sqlite.prepare(`INSERT INTO runs(id,device,mode,seed,status,question_index,streak,score,altitude,started_at,finished_at,flight_kind,day,start_altitude,peak_altitude,correct_total,content_version,competition_version,answer_elapsed_ms)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,device,mode,day,status,index,0,score,altitude,started,status === 'finished' ? started + 10000 : null,'daily',day,1500,Math.max(1500,altitude),5,2,version,elapsed);
}

test('leaderboard orders final height, points, answer time and start time while excluding all ineligible records', async () => {
  const f = fixture();
  try {
    const { date } = await f.call('daily');
    const players = [
      { id:'height-wins',device:'rank-height-device-123',altitude:5000,score:10,elapsed:9000,started:400 },
      { id:'points-win',device:'rank-points-device-123',altitude:4000,score:200,elapsed:9000,started:400 },
      { id:'time-wins',device:f.device,altitude:4000,score:100,elapsed:500,started:400 },
      { id:'start-loses',device:'rank-start-device-123',altitude:4000,score:100,elapsed:500,started:500 },
      { id:'time-loses',device:'rank-time-device-123',altitude:4000,score:100,elapsed:1000,started:100 }
    ];
    for (const player of players) insertRanked(f,{...player,day:date});
    insertRanked(f,{id:'incomplete',device:'rank-incomplete-device-123',day:date,status:'ready',altitude:99999});
    insertRanked(f,{id:'old-version',device:'rank-legacy-device-123',day:date,version:2,altitude:99999});
    insertRanked(f,{id:'only-nine',device:'rank-nine-device-123',day:date,index:9,altitude:99999});
    insertRanked(f,{id:'other-day',device:'rank-otherday-device-123',day:'2020-01-01',altitude:99999});
    const board = await f.call('leaderboard');
    assert.equal(board.totalFinished,5); assert.equal(board.entries.length,5); assert.deepEqual(board.entries.map(entry=>entry.altitude),[5000,4000,4000,4000,4000]);
    assert.equal(board.entries[0].score,10); assert.equal(board.entries[1].score,200); assert.equal(board.entries[2].isYou,true); assert.equal(board.own.rank,3); assert.equal(board.entries[3].answerElapsedMs,500); assert.equal(board.entries[4].answerElapsedMs,1000);
    assert.equal(JSON.stringify(board).includes(f.device),false); assert.equal('device' in board.own,false); assert.equal('id' in board.own,false);
    assert.equal((await f.call('leaderboard?date=2026-02-30')).httpStatus,400); assert.equal((await f.call('leaderboard?date=invalid')).httpStatus,400);
  } finally { f.sqlite.close(); }
});

test('own daily position is computed over the complete field beyond the twenty returned leaders', async () => {
  const f = fixture();
  try {
    const {date}=await f.call('daily');
    for(let index=0;index<25;index++) insertRanked(f,{id:'large-field-'+index,device:index===24?f.device:'large-field-device-'+index,day:date,altitude:5000-index*100,started:1000+index});
    const board=await f.call('leaderboard'); assert.equal(board.entries.length,20); assert.equal(board.totalFinished,25); assert.equal(board.own.rank,25); assert.equal(board.own.altitude,2600); assert.equal(board.entries.some(entry=>entry.isYou),false);
  } finally { f.sqlite.close(); }
});

test('rufnames are optional, validated, persistent and never allow markup; deleting data removes the profile and ranking', async () => {
  const f = fixture();
  try {
    const initial=await f.call('profile'); assert.match(initial.name,/^Pilot-[A-Z0-9]+$/); assert.deepEqual(await f.call('profile'),initial);
    for(const name of ['', 'A','<img src=x>', 'Name\u200Bhidden','x'.repeat(21),'----','🛩️ Pilot']) assert.equal((await f.call('profile',{name})).httpStatus,400,name);
    const saved=await f.call('profile',{name:'  Überflieger   13  '}); assert.equal(saved.name,'Überflieger 13'); assert.equal((await f.call('profile')).name,'Überflieger 13');
    const {date}=await f.call('daily'); insertRanked(f,{id:'named-result',device:f.device,day:date}); assert.equal((await f.call('leaderboard')).own.name,'Überflieger 13');
    await f.call('profile',{name:'Neue Crew'}); assert.equal((await f.call('leaderboard')).own.name,'Neue Crew');
    await f.call('delete',{}); assert.equal((await f.call('leaderboard')).own,null); assert.equal((await f.call('leaderboard')).totalFinished,0); assert.equal((await f.call('profile')).name,initial.name); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM pilots').get().n,0);
  } finally { f.sqlite.close(); }
});

test('an old v2 daily attempt retains the original buffer rule and cannot be replaced or ranked as a ten-question attempt', async () => {
  const f=fixture();
  try {
    const {date}=await f.call('daily'); const id='old-v2-daily';
    f.sqlite.prepare(`INSERT INTO runs(id,device,mode,seed,status,started_at,flight_kind,day,start_altitude,altitude,peak_altitude,content_version,competition_version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,f.device,'mix',date,'ready',Date.now(),'daily',date,1500,1500,1500,2,2);
    const existing=await f.call('start',{mode:'daily'}); assert.equal(existing.id,id); assert.equal(existing.competitionVersion,2); assert.equal(existing.questionCount,null);
    let last;
    for(let index=0;index<5;index++) { const flying=await f.call('next',{runId:id}); last=await wrong(f,flying); assert.equal(last.status,index<4?'ready':'crashed'); }
    assert.equal((await f.call('start',{mode:'daily'})).id,id); assert.equal((await f.call('leaderboard')).totalFinished,0); assert.equal(last.completed,false);
  } finally { f.sqlite.close(); }
});


test('a stored shared day set controls every player and later position instead of reselecting from the current bank', async () => {
  const f=fixture(); const other='saved-set-device-1234567';
  try {
    const {date,mode}=await f.call('daily');
    const saved=Array.from({length:10},(_,index)=>structuredClone(dailyQuestionFor(date,index)));
    saved[0].prompt='Eine bereits gespeicherte erste Tagesfrage.'; saved[1].prompt='Eine bereits gespeicherte zweite Tagesfrage.';
    const json=JSON.stringify(saved);
    f.sqlite.prepare('INSERT INTO daily_challenges(day,mode,questions_json,created_at) VALUES(?,?,?,?)').run(date,mode,json,123);
    const a=await f.call('start',{mode:'daily'}); const b=await f.call('start',{mode:'daily'},other);
    const first=await f.call('next',{runId:a.id}); const peer=await f.call('next',{runId:b.id},other);
    assert.equal(first.question.prompt,saved[0].prompt); assert.deepEqual(first.question,peer.question);
    assert.equal(first.timeLimitMs,20000,'pre-update day sets retain their common original clock');
    const result=await right(f,first); const next=await f.call('next',{runId:result.id}); assert.equal(next.question.prompt,saved[1].prompt);
    assert.equal(next.timeLimitMs,19750);
    const unchanged=f.sqlite.prepare('SELECT questions_json,created_at FROM daily_challenges WHERE day=?').get(date);
    assert.equal(unchanged.questions_json,json); assert.equal(unchanged.created_at,123);
  } finally {f.sqlite.close();}
});
