import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const token = String(process.env.MAPBOX_PUBLIC_TOKEN || '').trim();
if (!/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
  throw new Error('MAPBOX_PUBLIC_TOKEN must be a valid pk. public token.');
}

const configPath = path.resolve(import.meta.dirname, '..', 'js', 'mapbox_config.js');
const source = await readFile(configPath, 'utf8');
if (!source.includes('enabled: false') || !source.includes("accessToken: ''")) {
  throw new Error('The public Mapbox configuration template is unexpected.');
}

const published = source
  .replace('enabled: false', 'enabled: true')
  .replace("accessToken: ''", `accessToken: '${token}'`);

await writeFile(configPath, published, 'utf8');
console.log('Configured the public Mapbox token for this Pages deployment.');
