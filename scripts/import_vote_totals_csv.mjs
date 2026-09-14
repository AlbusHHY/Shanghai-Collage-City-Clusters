import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const requiredHeaders = [
  'scale',
  'cluster_id',
  'cluster_size',
  'familiarity_unfamiliar',
  'familiarity_moderately_familiar',
  'familiarity_very_familiar',
  'boundary_no_match',
  'boundary_moderate_match',
  'boundary_strong_match',
  'total_votes'
];

function parseCsv(source) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some(value => value !== '')) rows.push(row);
  }
  return rows;
}

function integer(value, field, key, minimum = 0) {
  if (!/^-?\d+$/.test(value)) throw new Error(`${key}: ${field} is not an integer.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${key}: ${field} must be at least ${minimum}.`);
  }
  return number;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const inputArgument = process.argv[2];
if (!inputArgument) {
  throw new Error('Usage: npm run votes:import -- <anonymous-aggregate.csv>');
}

const projectRoot = path.resolve(import.meta.dirname, '..');
const inputPath = path.resolve(inputArgument);
const raw = (await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, '');
const parsed = parseCsv(raw);
if (parsed.length < 2) throw new Error('CSV does not contain any vote rows.');

const headers = parsed[0];
if (headers.length !== requiredHeaders.length || headers.some((header, index) => header !== requiredHeaders[index])) {
  throw new Error(`CSV headers must be exactly: ${requiredHeaders.join(',')}`);
}

const importedAt = (await stat(inputPath)).mtime.toISOString();
const seen = new Set();
const clusters = parsed.slice(1).map((values, rowIndex) => {
  if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`);
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  const scale = integer(record.scale, 'scale', `row ${rowIndex + 2}`, 1);
  if (scale > 5) throw new Error(`row ${rowIndex + 2}: scale must be between 1 and 5.`);
  if (!new RegExp(`^S${scale}-C\\d{4}$`).test(record.cluster_id)) {
    throw new Error(`row ${rowIndex + 2}: cluster_id does not match the scale.`);
  }
  const key = `${scale}|${record.cluster_id}`;
  if (seen.has(key)) throw new Error(`Duplicate cluster: ${key}`);
  seen.add(key);

  const communitySize = integer(record.cluster_size, 'cluster_size', key, 1);
  const familiarityUnfamiliar = integer(record.familiarity_unfamiliar, 'familiarity_unfamiliar', key);
  const familiarityModerate = integer(record.familiarity_moderately_familiar, 'familiarity_moderately_familiar', key);
  const familiarityVery = integer(record.familiarity_very_familiar, 'familiarity_very_familiar', key);
  const boundaryNoMatch = integer(record.boundary_no_match, 'boundary_no_match', key);
  const boundaryModerate = integer(record.boundary_moderate_match, 'boundary_moderate_match', key);
  const boundaryStrong = integer(record.boundary_strong_match, 'boundary_strong_match', key);
  const totalVotes = integer(record.total_votes, 'total_votes', key);

  if (familiarityUnfamiliar + familiarityModerate + familiarityVery !== totalVotes) {
    throw new Error(`${key}: familiarity counts do not equal total_votes.`);
  }
  if (boundaryNoMatch + boundaryModerate + boundaryStrong !== totalVotes) {
    throw new Error(`${key}: boundary counts do not equal total_votes.`);
  }

  return {
    scale,
    community_id: record.cluster_id,
    community_size: communitySize,
    familiarity: {
      unfamiliar: familiarityUnfamiliar,
      somewhat_familiar: familiarityModerate,
      very_familiar: familiarityVery
    },
    boundary_match: {
      no_match: boundaryNoMatch,
      moderate_match: boundaryModerate,
      strong_match: boundaryStrong
    },
    total_votes: totalVotes,
    last_updated: importedAt
  };
}).sort((left, right) => left.scale - right.scale || left.community_id.localeCompare(right.community_id));

const aggregate = {
  version: 2,
  storage: 'anonymous_aggregate_only',
  clusters
};
const json = `${JSON.stringify(aggregate, null, 2)}\n`;
await writeFile(path.join(projectRoot, 'data', 'votes.json'), json, 'utf8');
await writeFile(path.join(projectRoot, 'data', 'vote_totals_seed.json'), json, 'utf8');

const sql = [
  '-- Anonymous aggregate seed generated from a validated aggregate CSV.',
  '-- No visitor IDs, IP addresses, user agents, or individual ballots are included.',
  'BEGIN TRANSACTION;',
  ...clusters.map(cluster => {
    const values = [
      cluster.scale,
      sqlText(cluster.community_id),
      cluster.community_size,
      cluster.familiarity.unfamiliar,
      cluster.familiarity.somewhat_familiar,
      cluster.familiarity.very_familiar,
      cluster.boundary_match.no_match,
      cluster.boundary_match.moderate_match,
      cluster.boundary_match.strong_match,
      cluster.total_votes,
      sqlText(cluster.last_updated)
    ].join(', ');
    return `INSERT OR REPLACE INTO cluster_vote_totals (scale, community_id, community_size, familiarity_unfamiliar, familiarity_moderate, familiarity_very, boundary_no_match, boundary_moderate_match, boundary_strong_match, total_votes, updated_at) VALUES (${values});`;
  }),
  'COMMIT;',
  ''
].join('\n');
await writeFile(path.join(projectRoot, 'worker', 'seed.sql'), sql, 'utf8');

const totalVotes = clusters.reduce((sum, cluster) => sum + cluster.total_votes, 0);
console.log(`Imported ${clusters.length} anonymous cluster totals (${totalVotes} votes).`);
