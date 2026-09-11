import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const sourcePath = path.join(projectRoot, 'worker', 'src', 'index.js');
const seedPath = path.join(projectRoot, 'data', 'vote_totals_seed.json');
const manifestPath = path.join(projectRoot, '.openai', 'hosting.json');
const migrationsPath = path.join(projectRoot, 'drizzle');

await rm(distRoot, { recursive: true, force: true });
await mkdir(path.join(distRoot, 'server'), { recursive: true });
await mkdir(path.join(distRoot, '.openai'), { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const seed = JSON.parse(await readFile(seedPath, 'utf8'));
if (!Array.isArray(seed.clusters) || seed.storage !== 'anonymous_aggregate_only') {
  throw new Error('The anonymous aggregate seed is invalid.');
}
const bundledSource = source.replace("'__VOTE_SEED_DATA__'", JSON.stringify(seed.clusters));
if (bundledSource === source) throw new Error('Vote seed placeholder was not found.');

await writeFile(path.join(distRoot, 'server', 'index.js'), bundledSource, 'utf8');
await cp(manifestPath, path.join(distRoot, '.openai', 'hosting.json'));
await cp(migrationsPath, path.join(distRoot, '.openai', 'drizzle'), { recursive: true });

console.log(`Built anonymous voting API with ${seed.clusters.length} aggregate seed rows.`);
