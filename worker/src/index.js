const familiarityValues = ['unfamiliar', 'somewhat_familiar', 'very_familiar'];
const boundaryValues = ['disagree', 'somewhat_agree', 'strongly_agree'];
const seedVoteTotals = '__VOTE_SEED_DATA__';
const defaultAllowedOrigins = new Set([
  'https://albushhy.github.io',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
]);

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '*';
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return defaultAllowedOrigins.has(origin) || configured.includes(origin) ? origin : null;
}

function headers(origin, contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
}

function json(payload, status, origin) {
  return new Response(JSON.stringify(payload), { status, headers: headers(origin) });
}

function validVote(vote) {
  const scale = Number(vote?.scale);
  return Number.isInteger(scale) && scale >= 1 && scale <= 5 &&
    new RegExp(`^S${scale}-C\\d{4}$`).test(String(vote?.community_id || '')) &&
    Number.isInteger(Number(vote?.community_size)) && Number(vote.community_size) >= 1 && Number(vote.community_size) <= 5956 &&
    familiarityValues.includes(vote?.familiarity) && boundaryValues.includes(vote?.agreement);
}

function deltaFor(current, previous) {
  const delta = {
    familiarity_unfamiliar: 0,
    familiarity_moderate: 0,
    familiarity_very: 0,
    boundary_no_match: 0,
    boundary_moderate_match: 0,
    boundary_strong_match: 0,
    total_votes: previous ? 0 : 1
  };
  const familiarityColumns = { unfamiliar: 'familiarity_unfamiliar', somewhat_familiar: 'familiarity_moderate', very_familiar: 'familiarity_very' };
  const boundaryColumns = { disagree: 'boundary_no_match', somewhat_agree: 'boundary_moderate_match', strongly_agree: 'boundary_strong_match' };
  delta[familiarityColumns[current.familiarity]] += 1;
  delta[boundaryColumns[current.agreement]] += 1;
  if (previous && familiarityValues.includes(previous.familiarity) && boundaryValues.includes(previous.agreement)) {
    delta[familiarityColumns[previous.familiarity]] -= 1;
    delta[boundaryColumns[previous.agreement]] -= 1;
  }
  return delta;
}

async function totals(db, scale, communityId) {
  const row = await db.prepare('SELECT * FROM cluster_vote_totals WHERE scale = ? AND community_id = ?').bind(scale, communityId).first();
  return {
    familiarity: {
      unfamiliar: Number(row?.familiarity_unfamiliar || 0),
      somewhat_familiar: Number(row?.familiarity_moderate || 0),
      very_familiar: Number(row?.familiarity_very || 0)
    },
    agreement: {
      disagree: Number(row?.boundary_no_match || 0),
      somewhat_agree: Number(row?.boundary_moderate_match || 0),
      strongly_agree: Number(row?.boundary_strong_match || 0)
    },
    total_votes: Number(row?.total_votes || 0)
  };
}

async function saveVote(request, env, origin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400, origin); }
  if (!validVote(body)) return json({ error: 'Vote values are invalid.' }, 422, origin);
  const previous = body.previous_vote && familiarityValues.includes(body.previous_vote.familiarity) && boundaryValues.includes(body.previous_vote.agreement) ? body.previous_vote : null;
  const delta = deltaFor(body, previous);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO cluster_vote_totals (
      scale, community_id, community_size,
      familiarity_unfamiliar, familiarity_moderate, familiarity_very,
      boundary_no_match, boundary_moderate_match, boundary_strong_match,
      total_votes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scale, community_id) DO UPDATE SET
      community_size = excluded.community_size,
      familiarity_unfamiliar = MAX(0, familiarity_unfamiliar + excluded.familiarity_unfamiliar),
      familiarity_moderate = MAX(0, familiarity_moderate + excluded.familiarity_moderate),
      familiarity_very = MAX(0, familiarity_very + excluded.familiarity_very),
      boundary_no_match = MAX(0, boundary_no_match + excluded.boundary_no_match),
      boundary_moderate_match = MAX(0, boundary_moderate_match + excluded.boundary_moderate_match),
      boundary_strong_match = MAX(0, boundary_strong_match + excluded.boundary_strong_match),
      total_votes = MAX(0, total_votes + excluded.total_votes),
      updated_at = excluded.updated_at
  `).bind(
    Number(body.scale), String(body.community_id), Number(body.community_size),
    delta.familiarity_unfamiliar, delta.familiarity_moderate, delta.familiarity_very,
    delta.boundary_no_match, delta.boundary_moderate_match, delta.boundary_strong_match,
    delta.total_votes, updatedAt
  ).run();
  return json({ ok: true, totals: await totals(env.DB, Number(body.scale), String(body.community_id)) }, 200, origin);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function exportCsv(env, origin) {
  const result = await env.DB.prepare('SELECT * FROM cluster_vote_totals ORDER BY scale, community_id').all();
  const keys = ['scale','cluster_id','cluster_size','familiarity_unfamiliar','familiarity_moderately_familiar','familiarity_very_familiar','boundary_no_match','boundary_moderate_match','boundary_strong_match','total_votes','last_updated'];
  const rows = [keys, ...(result.results || []).map(row => [row.scale,row.community_id,row.community_size,row.familiarity_unfamiliar,row.familiarity_moderate,row.familiarity_very,row.boundary_no_match,row.boundary_moderate_match,row.boundary_strong_match,row.total_votes,row.updated_at])];
  return new Response('\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), { status: 200, headers: headers(origin, 'text/csv; charset=utf-8') });
}

async function seedAnonymousTotals(env, origin) {
  if (!Array.isArray(seedVoteTotals)) return json({ error: 'Seed data is unavailable.' }, 503, origin);
  const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM cluster_vote_totals').first();
  if (Number(existing?.count || 0) > 0) {
    return json({ ok: true, seeded: false, reason: 'Database already contains aggregate totals.' }, 200, origin);
  }

  const statements = seedVoteTotals.map(row => env.DB.prepare(`
    INSERT INTO cluster_vote_totals (
      scale, community_id, community_size,
      familiarity_unfamiliar, familiarity_moderate, familiarity_very,
      boundary_no_match, boundary_moderate_match, boundary_strong_match,
      total_votes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    Number(row.scale), String(row.community_id), Number(row.community_size),
    Number(row.familiarity.unfamiliar), Number(row.familiarity.somewhat_familiar), Number(row.familiarity.very_familiar),
    Number(row.boundary_match.no_match), Number(row.boundary_match.moderate_match), Number(row.boundary_match.strong_match),
    Number(row.total_votes), String(row.last_updated)
  ));
  await env.DB.batch(statements);
  const verification = await env.DB.prepare('SELECT COUNT(*) AS clusters, SUM(total_votes) AS total_votes FROM cluster_vote_totals').first();
  return json({ ok: true, seeded: true, clusters: Number(verification?.clusters || 0), total_votes: Number(verification?.total_votes || 0) }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return json({ error: 'Origin not allowed.' }, 403, 'null');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/votes') return saveVote(request, env, origin);
    if (request.method === 'GET' && url.pathname === '/api/votes/stats') {
      const scale = Number(url.searchParams.get('scale'));
      const communityId = String(url.searchParams.get('community_id') || '');
      if (!Number.isInteger(scale) || scale < 1 || scale > 5 || !new RegExp(`^S${scale}-C\\d{4}$`).test(communityId)) return json({ error: 'Invalid cluster.' }, 400, origin);
      return json({ totals: await totals(env.DB, scale, communityId) }, 200, origin);
    }
    if (request.method === 'GET' && url.pathname === '/api/votes/export.csv') return exportCsv(env, origin);
    if (request.method === 'POST' && url.pathname === '/api/votes/seed-anonymous-totals') return seedAnonymousTotals(env, origin);
    return json({ error: 'Not found.' }, 404, origin);
  }
};
