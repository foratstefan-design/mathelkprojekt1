import { modes, publicQuestion, gradeChoice, timeLimitMs, flightReward, difficultyFor } from './engine.js';
import { legacyQuestionFor } from './legacy-engine.js';
import { createCatalog, CatalogPoolExhaustedError } from './catalog.js';

const LATENCY_GRACE_MS = 500;
const DAILY_QUESTION_COUNT = 10;
// Pages serves the public client; game state stays on the existing API. Restrict
// browser access to this exact owner origin and the gameplay routes only.
const PAGES_ORIGIN = 'https://foratstefan-design.github.io';
const GAMEPLAY_PATHS = new Set(['catalog', 'profile', 'leaderboard', 'start', 'daily', 'run', 'next', 'answer', 'stats', 'history', 'delete'].map(path => '/api/' + path));
// Explicit owner-authorized replacements. Fixed dates never reset another day
// or grant extra attempts when the same version is deployed again.
const REPLACEMENT_DAYS = new Set(['2026-11-25','2026-11-26']);
const dailyRevisionFor = date => REPLACEMENT_DAYS.has(date)?1:0;
const DAILY_DIFFICULTIES=[1,1,1,2,2,3,3,3,3,3];
const dailyKey = (date,revision) => revision?date+':revision:'+revision:date;
const today = (at = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(at));

/** Shared prepared SQL runs against node:sqlite locally and Cloudflare D1. */
export function createAPI(db) {
  const catalog = createCatalog(db);
  const all = (sql, ...params) => db.all(sql, params);
  const one = async (sql, ...params) => (await all(sql, ...params))[0];
  const write = (sql, ...params) => db.run(sql, params);
  const notFound = () => Object.assign(new Error('Dieser Flug wurde nicht gefunden.'), { status: 404 });
  const modeIds = new Set(modes.map(mode => mode.id));
  modeIds.add('daily');
  const kind = row => row.flight_kind === 'daily' ? 'daily' : 'free';
  const competition = row => kind(row) === 'daily' && row.competition_version >= 3;
  const superseded = row => kind(row)==='daily'&&(row.daily_revision||0)<dailyRevisionFor(row.day);
  const peak = row => Math.max(row.peak_altitude || 0, row.altitude || 0);
  const totalCorrect = row => row.content_version < 2 ? Math.max(row.correct_total || 0, row.streak || 0) : row.correct_total || 0;
  const limitFor = (row, question) => question?._limitMs || timeLimitMs(competition(row) ? row.question_index : totalCorrect(row), { daily: kind(row) === 'daily', recovering: row.danger > 0 });
  const snapshot = row => row.question_json ? JSON.parse(row.question_json) : null;
  const modeLabel = mode => modes.find(candidate => candidate.id === mode)?.label || mode;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  async function dailyInfo(date) {
    const revision=dailyRevisionFor(date);
    const saved = revision?await one('SELECT mode,questions_json FROM daily_challenge_revisions WHERE day=? AND revision=?',date,revision):await one('SELECT mode,questions_json FROM daily_challenges WHERE day = ?', date);
    const mode = saved?.mode || 'mix';
    const difficultyPlan=saved?.questions_json?JSON.parse(saved.questions_json).map(question=>question.difficulty||1):[...DAILY_DIFFICULTIES];
    return { date, mode, dailyMode: mode, label: modeLabel(mode), questionCount: DAILY_QUESTION_COUNT,dailyRevision:revision,refreshed:revision>0,difficultyPlan,progressiveDaily:difficultyPlan.join(',')===DAILY_DIFFICULTIES.join(',') };
  }

  async function challengeFor(date,revision=dailyRevisionFor(date)) {
    const read=()=>revision?one('SELECT mode,questions_json FROM daily_challenge_revisions WHERE day=? AND revision=?',date,revision):one('SELECT mode, questions_json FROM daily_challenges WHERE day = ?', date);
    let saved = await read();
    if (!saved) {
      const questions = (await catalog.reserveDaily(dailyKey(date,revision),'mix')).map((question,index)=>({...question,_limitMs:timeLimitMs(index,{daily:true})}));
      // One shared immutable set wins even when two requests or deploys race.
      if(revision)await write('INSERT OR IGNORE INTO daily_challenge_revisions(day,revision,mode,questions_json,created_at) VALUES(?,?,?,?,?)',date,revision,'mix',JSON.stringify(questions),Date.now());
      else await write('INSERT OR IGNORE INTO daily_challenges(day, mode, questions_json, created_at) VALUES (?, ?, ?, ?)', date, 'mix', JSON.stringify(questions), Date.now());
      saved = await read();
    }
    // Sets saved before the gentler timing update keep their original common
    // windows. The presence of _limitMs versions the immutable set without
    // changing today's question selection or any already armed snapshot.
    const questions = JSON.parse(saved.questions_json).map((question,index) => ({ ...question, _limitMs: question._limitMs || Math.max(8000, 20000-index*250) }));
    return { mode: saved.mode, questions };
  }

  const generatedName = device => {
    let hash = 2166136261;
    for (const char of device) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return 'Pilot-' + (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
  };
  async function profile(device) {
    const row = await one('SELECT name FROM pilots WHERE device = ?', device);
    return { name: row?.name || generatedName(device) };
  }

  async function owned(id, device) {
    const row = await one('SELECT * FROM runs WHERE id = ? AND device = ?', id, device);
    if (!row) throw notFound();
    return row;
  }

  async function upgraded(row) {
    if (row.content_version >= 2) return row;
    // Freeze an already armed v1 question from the exact prior Git version.
    // Its choices, correct answer and old time window survive a content deploy.
    let question = snapshot(row);
    if (!question && row.status === 'flying') question = { ...legacyQuestionFor(row.seed, row.question_index, row.mode), difficulty: 1, familyId: 'legacy:' + row.question_index, _limitMs: Math.max(2500, 14000 - row.streak * 450) };
    await write('UPDATE runs SET correct_total = ?, peak_altitude = ?, question_json = ?, content_version = 2 WHERE id = ? AND content_version < 2', totalCorrect(row), peak(row), question ? JSON.stringify(question) : null, row.id);
    return one('SELECT * FROM runs WHERE id = ?', row.id);
  }

  async function nextQuestion(row) {
    if (competition(row)) {
      const question={ ...(await challengeFor(row.day,row.daily_revision||0)).questions[row.question_index] };
      return await catalog.markDailySeen(row,question) ? question : null;
    }
    const question=await catalog.claimFree(row,difficultyFor(row.altitude,row.start_altitude,row.question_index));
    return question ? {...question,_limitMs:limitFor(row)} : null;
  }

  function resultFor(row, question, choiceId, { receivedAt, expired = false } = {}) {
    const limit = limitFor(row, question);
    const timedOut = expired || receivedAt > row.deadline + LATENCY_GRACE_MS;
    const grade = gradeChoice(question, choiceId);
    const correct = grade.correct && !timedOut;
    const remainingMs = Math.max(0, Math.min(limit, row.deadline - receivedAt));
    const reward = correct ? flightReward(row.streak, remainingMs, limit) : { points: 0, altitudeGain: 0 };
    const daily = kind(row) === 'daily';
    const danger = correct || daily ? 0 : Math.min(3, row.danger + 1);
    const nominalLoss = correct ? 0 : daily ? 350 : danger === 1 ? 250 : danger === 2 ? 400 : row.altitude;
    const altitudeLoss = Math.min(row.altitude, nominalLoss);
    const altitude = Math.max(0, row.altitude + reward.altitudeGain - altitudeLoss);
    const survived = competition(row) || correct || (daily ? altitude > 0 : danger < 3);
    const completed = competition(row) && row.question_index + 1 === DAILY_QUESTION_COUNT;
    const elapsedMs = timedOut ? limit : Math.max(0, Math.min(limit, Math.round(limit - remainingMs)));
    return { ...grade, correct, questionId: question.id, questionIndex: row.question_index,
      prompt: question.prompt, category: question.category, type: question.type,
      familyId: question.familyId || question.id, difficulty: question.difficulty || 1,
      timedOut, expired, receivedAt, remainingMs, timeLimitMs: limit,
      points: reward.points, earnedPoints: reward.points, altitudeGain: reward.altitudeGain,
      streak: correct ? row.streak + 1 : 0, score: row.score + reward.points,
      altitude, altitudeLoss, altitudeDelta: reward.altitudeGain - altitudeLoss,
      peakAltitude: Math.max(peak(row), altitude), correctTotal: totalCorrect(row) + Number(correct),
      danger, survived, rescued: correct && row.danger > 0, completed,
      elapsedMs, answerElapsedMs: (row.answer_elapsed_ms || 0) + elapsedMs };
  }

  async function insertAnswer(row, question, choiceId, result) {
    await write('INSERT OR IGNORE INTO answers (run_id, position, question_id, choice_id, expired, result, received_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM runs WHERE id = ? AND question_index = ? AND status = ?)', row.id, row.question_index, question.id, choiceId, result.expired ? 1 : 0, JSON.stringify(result), result.receivedAt, row.id, row.question_index, 'flying');
    return one('SELECT result FROM answers WHERE run_id = ? AND position = ?', row.id, row.question_index);
  }

  function validClaim(question, claim) {
    return question.id === claim.questionId && (claim.choiceId === null ? claim.expired === true : typeof claim.choiceId === 'string' && question.options.some(option => option.id === claim.choiceId));
  }

  async function resolveClaim(row, saved) {
    if (!saved || JSON.parse(saved.result).status !== 'checking') return saved;
    const claim = JSON.parse(saved.result);
    const question = snapshot(row);
    if (validClaim(question, claim)) {
      const result = resultFor(row, question, claim.choiceId, claim);
      await write('UPDATE answers SET result = ? WHERE run_id = ? AND position = ? AND result = ?', JSON.stringify(result), row.id, row.question_index, saved.result);
    } else {
      // A malformed request must neither consume the question nor freeze expiry.
      await write('DELETE FROM answers WHERE run_id = ? AND position = ? AND result = ?', row.id, row.question_index, saved.result);
    }
    return one('SELECT result FROM answers WHERE run_id = ? AND position = ?', row.id, row.question_index);
  }

  // Answer persistence and run advancement are separately retryable. The answer's
  // unique position wins once; the guarded update cannot add its reward twice.
  async function settle(row, { expire = true, at = Date.now() } = {}) {
    if(superseded(row))return row;
    row = await one('SELECT * FROM runs WHERE id = ?', row.id);
    if (!row) throw notFound();
    row = await upgraded(row);
    if (row.status !== 'flying') return row;
    let saved = await resolveClaim(row, await one('SELECT result FROM answers WHERE run_id = ? AND position = ?', row.id, row.question_index));
    if (!saved && expire && at > row.deadline + LATENCY_GRACE_MS) {
      const question = snapshot(row);
      const result = resultFor(row, question, null, { receivedAt: at, expired: true });
      // A timely choice can have won the unique key since the earlier read.
      saved = await resolveClaim(row, await insertAnswer(row, question, null, result));
    }
    if (saved) {
      const result = JSON.parse(saved.result);
      const survived = result.survived ?? result.correct;
      const status = result.completed ? 'finished' : survived ? 'ready' : 'crashed';
      const terminal = status === 'finished' || status === 'crashed';
      await write('UPDATE runs SET status = ?, question_index = ?, streak = ?, score = ?, altitude = ?, peak_altitude = ?, correct_total = ?, danger = ?, answer_elapsed_ms = ?, question_json = NULL, deadline = NULL, crash_reason = ?, finished_at = ? WHERE id = ? AND question_index = ? AND status = ?', status, row.question_index + Number(survived), result.streak, result.score, result.altitude, result.peakAltitude ?? Math.max(peak(row), result.altitude), result.correctTotal ?? Math.max(totalCorrect(row), result.streak), result.danger || 0, result.answerElapsedMs ?? row.answer_elapsed_ms, status === 'crashed' ? result.timedOut ? 'timeout' : 'wrong' : null, terminal ? result.receivedAt : null, row.id, row.question_index, 'flying');
      row = await one('SELECT * FROM runs WHERE id = ?', row.id);
      if (!row) throw notFound();
    }
    return row;
  }

  async function state(row, options) {
    row = await settle(row, options);
    await catalog.backfillDevice(row.device);
    if(row.status==='flying')await catalog.rememberSnapshot(row,snapshot(row));
    // Endless flights keep their complete history in SQLite/D1. The live payload
    // only needs a short chronological window, even after hundreds of successes.
    const stored = await all('SELECT result FROM answers WHERE run_id = ? ORDER BY position DESC LIMIT 20', row.id);
    const results = stored.reverse().map(answer => JSON.parse(answer.result)).filter(result => result.status !== 'checking');
    const question = snapshot(row);
    const pilot = await profile(row.device);
    const replaced=superseded(row);
    const nextDailyQuestion = !replaced&&competition(row) && row.question_index < DAILY_QUESTION_COUNT ? (await challengeFor(row.day,row.daily_revision||0)).questions[row.question_index] : null;
    const nextDifficulty = nextDailyQuestion?.difficulty || difficultyFor(row.altitude, row.start_altitude, row.question_index);
    return { id: row.id, mode: kind(row) === 'daily' ? 'daily' : row.mode, kind: kind(row), flightKind: kind(row), dailyDate: row.day,
      dailyMode: kind(row) === 'daily' ? row.mode : null, competitionVersion: row.competition_version,
      dailyRevision:row.daily_revision||0,dailySuperseded:replaced,replacementMessage:replaced?'Der heutige Tagesflug wurde neu gemischt. Dein bisheriger Flug bleibt erhalten; du hast einen neuen Versuch.':null,
      questionCount: competition(row) ? DAILY_QUESTION_COUNT : null, completed: row.status === 'finished',
      poolExhausted:row.status==='exhausted',exhaustionMessage:row.status==='exhausted'?'Alle verfügbaren neuen Fragen dieses Kurses sind bereits gespielt. Es wird keine bekannte Frage wiederholt.':null,
      pilotName: pilot.name, answerElapsedMs: row.answer_elapsed_ms,
      startAltitude: row.start_altitude, peakAltitude: peak(row), danger: row.danger,
      correctTotal: totalCorrect(row), recovering: row.danger > 0,
      difficulty: question?.difficulty || nextDifficulty,
      status: row.status, index: row.question_index,
      streak: row.streak, score: row.score, altitude: row.altitude,
      timeLimitMs: row.status === 'finished' ? results.at(-1)?.timeLimitMs || limitFor(row, question) : limitFor(row, question || nextDailyQuestion), deadline: replaced?null:row.deadline,
      // Future labels stay hidden during feedback and untimed preparation.
      question: !replaced&&row.status === 'flying' ? publicQuestion(question, row.seed, row.question_index) : null,
      results, resultCount: row.question_index + Number(row.status === 'crashed'), latestResult: results.at(-1) || null,
      crashReason: row.crash_reason, startedAt: row.started_at, finishedAt: row.finished_at };
  }

  async function settledFlights(device) {
    const rows = await all("SELECT r.*, COALESCE((SELECT MAX(CAST(json_extract(a.result, '$.streak') AS INTEGER)) FROM answers a WHERE a.run_id = r.id), r.streak) AS best_streak FROM runs r WHERE device = ? ORDER BY started_at DESC", device);
    const flights = [];
    for (const row of rows) {
      const current = row.status === 'flying' ? await settle(row) : row;
      flights.push({ ...current, best_streak: Math.max(row.best_streak || 0, current.streak) });
    }
    return flights;
  }

  function summary(rows) {
    return { flights: rows.length, crashes: rows.filter(row => row.status === 'crashed').length,
      completed: rows.filter(row => row.status === 'finished').length,
      exhausted: rows.filter(row => row.status === 'exhausted').length,
      bestAltitude: Math.max(0, ...rows.map(peak)),
      bestStreak: Math.max(0, ...rows.map(row => Math.max(row.best_streak || 0, row.streak))),
      bestScore: Math.max(0, ...rows.map(row => row.score)),
      totalCorrect: rows.reduce((sum, row) => sum + totalCorrect(row), 0) };
  }

  return async function handle(request) {
    // Receipt is locked before the first asynchronous database read.
    const receivedAt = Date.now();
    const url = new URL(request.url);
    const gameplay = GAMEPLAY_PATHS.has(url.pathname);
    const pagesRequest = gameplay && request.headers.get('Origin') === PAGES_ORIGIN;
    const corsHeaders = {
      ...(gameplay ? { 'Vary': 'Origin' } : {}),
      ...(pagesRequest ? { 'Access-Control-Allow-Origin': PAGES_ORIGIN } : {})
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...corsHeaders
    } });
    // A browser's preflight has no device identifier and must not touch state.
    // The catalog importer is deliberately outside GAMEPLAY_PATHS.
    if (request.method === 'OPTIONS' && gameplay) {
      const method = request.headers.get('Access-Control-Request-Method');
      const headers = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if (!pagesRequest || !['GET', 'POST'].includes(method) || headers.some(header => header !== 'content-type')) return json({ error: 'Diese Browseranfrage ist nicht freigegeben.' }, 403);
      return new Response(null, { status: 204, headers: { ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
      } });
    }
    try {
      let body = {};
      if (request.method === 'POST') {
        if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Diese Anfrage ist zu lang.' }, 413);
        const raw = await request.text();
        if (raw.length > 4096) return json({ error: 'Diese Anfrage ist zu lang.' }, 413);
        try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); }
        catch { return json({ error: 'Ungültige Anfrage.' }, 400); }
      }
      const device = body.device || url.searchParams.get('device');
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(device || '')) return json({ error: 'Eine gültige anonyme Gerätekennung fehlt.' }, 400);

      if (request.method === 'GET' && url.pathname === '/api/catalog') return json(await catalog.stats(device));

      if (request.method === 'GET' && url.pathname === '/api/profile') return json(await profile(device));

      if (request.method === 'POST' && url.pathname === '/api/profile') {
        const name = typeof body.name === 'string' ? body.name.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
        const length = Array.from(name).length;
        if (length < 2 || length > 20 || !/^[\p{L}\p{M}\p{N} _-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) return json({ error: 'Dein Rufname braucht 2–20 Zeichen: Buchstaben, Zahlen, Leerzeichen, Bindestrich oder Unterstrich.' }, 400);
        await write('INSERT INTO pilots(device, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(device) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at', device, name, receivedAt);
        return json({ name });
      }

      if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
        const date = url.searchParams.get('date') || today(receivedAt);
        if (!validDate(date)) return json({ error: 'Wähle ein gültiges Datum im Format JJJJ-MM-TT.' }, 400);
        // Rank the complete daily field before bounding the public payload. The
        // caller still sees their own place when it is outside the top twenty.
        const rows = await all(`WITH ranked AS (
          SELECT r.device, r.altitude, r.score, r.answer_elapsed_ms, r.finished_at, p.name,
            ROW_NUMBER() OVER (ORDER BY r.altitude DESC, r.score DESC, r.answer_elapsed_ms ASC, r.started_at ASC, r.id ASC) AS rank,
            COUNT(*) OVER () AS total_finished
          FROM runs r LEFT JOIN pilots p ON p.device = r.device
          WHERE r.day = ? AND r.daily_revision=? AND r.flight_kind = 'daily' AND r.competition_version = 3 AND r.status = 'finished' AND r.question_index = ?
        ) SELECT * FROM ranked WHERE rank <= 20 OR device = ? ORDER BY rank`, date, dailyRevisionFor(date), DAILY_QUESTION_COUNT, device);
        const entry = row => ({ rank: row.rank, name: row.name || generatedName(row.device), altitude: row.altitude, score: row.score,
          answerElapsedMs: row.answer_elapsed_ms, finishedAt: row.finished_at, isYou: row.device === device });
        return json({ ...await dailyInfo(date), entries: rows.filter(row => row.rank <= 20).map(entry), own: rows.some(row => row.device === device) ? entry(rows.find(row => row.device === device)) : null, totalFinished: rows[0]?.total_finished || 0 });
      }

      if (request.method === 'POST' && url.pathname === '/api/start') {
        const mode = body.mode || 'mix';
        if (!modeIds.has(mode)) return json({ error: 'Wähle einen gültigen Flugmodus.' }, 400);
        const daily = mode === 'daily';
        const day = daily ? today(receivedAt) : null;
        const revision=daily?dailyRevisionFor(day):0;
        if (daily) {
          const existing = await one("SELECT * FROM runs WHERE device = ? AND day = ? AND daily_revision=? AND flight_kind = 'daily'", device, day,revision);
          if (existing) return json(await state(existing));
        }
        const id = crypto.randomUUID();
        const startAltitude = daily ? 1500 : 0;
        const shared = daily ? await challengeFor(day,revision) : null;
        await write('INSERT OR IGNORE INTO runs (id, device, mode, seed, status, started_at, flight_kind, day, start_altitude, altitude, peak_altitude, content_version, competition_version,daily_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?,?)', id, device, daily ? shared.mode : mode, daily ? dailyKey(day,revision) : id, 'ready', receivedAt, daily ? 'daily' : 'free', day, startAltitude, startAltitude, startAltitude, daily ? 3 : 2,revision);
        const row = daily ? await one("SELECT * FROM runs WHERE device = ? AND day = ? AND daily_revision=? AND flight_kind = 'daily'", device, day,revision) : await owned(id, device);
        return json(await state(row));
      }

      if (request.method === 'GET' && url.pathname === '/api/daily') {
        const date = today(receivedAt);
        const info=await dailyInfo(date);
        const row = await one("SELECT * FROM runs WHERE device = ? AND day = ? AND daily_revision=? AND flight_kind = 'daily'", device, date,info.dailyRevision);
        const poolExhausted=!row&&!(await catalog.dailyAvailable(dailyKey(date,info.dailyRevision),info.mode));
        return json({ ...info, profile: await profile(device), attempt: row ? await state(row) : null, available: !row&&!poolExhausted,poolExhausted });
      }

      if (request.method === 'GET' && url.pathname === '/api/run') return json(await state(await owned(url.searchParams.get('id'), device)));

      if (request.method === 'POST' && url.pathname === '/api/next') {
        const row = await settle(await owned(body.runId, device));
        if(superseded(row))return json(await state(row));
        if (row.status === 'ready') {
          const question = await nextQuestion(row);
          if(question) await write('UPDATE runs SET status = ?, deadline = ?, question_json = ? WHERE id = ? AND question_index = ? AND status = ?', 'flying', Date.now() + question._limitMs, JSON.stringify(question), row.id, row.question_index, 'ready');
          else await write("UPDATE runs SET status='exhausted',deadline=NULL,question_json=NULL,finished_at=? WHERE id=? AND question_index=? AND status='ready'",Date.now(),row.id,row.question_index);
        }
        return json(await state(await owned(row.id, device)));
      }

      if (request.method === 'POST' && url.pathname === '/api/answer') {
        if (!Number.isSafeInteger(body.questionIndex) || body.questionIndex < 0) return json({ error: 'Die Fragenposition fehlt oder ist ungültig.' }, 400);
        if (typeof body.questionId !== 'string' || body.questionId.length > 160) return json({ error: 'Die Fragenkennung fehlt oder ist ungültig.' }, 400);
        if (body.expired !== undefined && typeof body.expired !== 'boolean') return json({ error: 'Ungültiger Zeitstatus.' }, 400);
        const empty = body.choiceId === undefined || body.choiceId === null || body.choiceId === '';
        const choiceId = empty ? null : body.choiceId;
        if ((!empty && (typeof choiceId !== 'string' || choiceId.length > 160)) || (empty && body.expired !== true)) return json({ error: 'Wähle eine der vorgegebenen Antworten.' }, 400);
        const claim = { status: 'checking', claimId: crypto.randomUUID(), questionId: body.questionId,
          questionIndex: body.questionIndex, choiceId, expired: body.expired === true, receivedAt };
        // First write claims receipt immediately. A simultaneous expiry read will
        // finish this exact choice instead of inventing a timeout over its top.
        await write("INSERT OR IGNORE INTO answers (run_id, position, question_id, choice_id, expired, result, received_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM runs WHERE id = ? AND device = ? AND question_index = ? AND status = ? AND NOT(flight_kind='daily' AND day IN (?,?) AND daily_revision<1))", body.runId, body.questionIndex, body.questionId, choiceId, claim.expired ? 1 : 0, JSON.stringify(claim), receivedAt, body.runId, device, body.questionIndex, 'flying',...REPLACEMENT_DAYS);
        const row = await upgraded(await owned(body.runId, device));
        if(superseded(row))return json(await state(row));
        let saved = await one('SELECT question_id, result FROM answers WHERE run_id = ? AND position = ?', row.id, body.questionIndex);
        if (!saved) return json({ error: 'Diese Frage ist gerade nicht aktiv.' }, 409);
        const first = JSON.parse(saved.result);
        if (first.status === 'checking') {
          const question = snapshot(row);
          if (!validClaim(question, first)) {
            await write('DELETE FROM answers WHERE run_id = ? AND position = ? AND result = ?', row.id, body.questionIndex, saved.result);
            return json({ error: 'Wähle eine der vorgegebenen Antworten der aktuellen Frage.' }, 400);
          }
        }
        if (saved.question_id !== body.questionId) return json({ error: 'Die Fragenkennung passt nicht zu dieser Position.' }, 409);
        const current = await state(row, { expire: false });
        saved = await one('SELECT result FROM answers WHERE run_id = ? AND position = ?', row.id, body.questionIndex);
        if (!saved) return json({ error: 'Die Antwort wurde inzwischen gelöscht.' }, 409);
        return json({ ...current, result: JSON.parse(saved.result) });
      }

      if (request.method === 'GET' && url.pathname === '/api/stats') {
        const rows = await settledFlights(device);
        return json({ ...summary(rows), free: summary(rows.filter(row => kind(row) === 'free')), daily: summary(rows.filter(row => kind(row) === 'daily')),
          byMode: Object.fromEntries([...new Set([...modes.map(mode => mode.id), 'daily'])].map(mode => [mode, summary(rows.filter(row => mode === 'daily' ? kind(row) === 'daily' : kind(row) === 'free' && row.mode === mode))])) });
      }

      if (request.method === 'GET' && url.pathname === '/api/history') {
        const rows = (await settledFlights(device)).filter(row => row.status === 'crashed' || row.status === 'finished' || row.status === 'exhausted'||superseded(row)).sort((a, b) => (b.finished_at||b.started_at) - (a.finished_at||a.started_at) || b.started_at - a.started_at).slice(0, 20);
        return json({ flights: rows.map(row => ({ id: row.id, mode: kind(row) === 'daily' ? 'daily' : row.mode, kind: kind(row), flightKind: kind(row), dailyDate: row.day, status: row.status,
          streak: row.streak, correctTotal: totalCorrect(row), score: row.score, altitude: row.altitude, peakAltitude: peak(row), startAltitude: row.start_altitude, crashReason: row.crash_reason,
          dailyMode: kind(row) === 'daily' ? row.mode : null, competitionVersion: row.competition_version, questionCount: competition(row) ? DAILY_QUESTION_COUNT : null, completed: row.status === 'finished', answerElapsedMs: row.answer_elapsed_ms,
          dailyRevision:row.daily_revision||0,dailySuperseded:superseded(row),
          startedAt: row.started_at, finishedAt: row.finished_at })) });
      }

      if (request.method === 'POST' && url.pathname === '/api/delete') {
        await write('DELETE FROM seen_questions WHERE device = ?',device);
        await write('DELETE FROM seen_question_backfills WHERE device = ?',device);
        await write('DELETE FROM answers WHERE run_id IN (SELECT id FROM runs WHERE device = ?)', device);
        await write('DELETE FROM runs WHERE device = ?', device);
        await write('DELETE FROM pilots WHERE device = ?', device);
        return json({ deleted: true });
      }
      return json({ error: 'Unbekannter API-Endpunkt.' }, 404);
    } catch (error) {
      if (!error.status) console.error('Höhenflug API:', error.message);
      return json({ error: error.status ? error.message : 'Dein Flug konnte nicht gespeichert werden. Bitte versuche es erneut.',...(error instanceof CatalogPoolExhaustedError?{poolExhausted:true,code:error.code}:{}) }, error.status || 500);
    }
  };
}
