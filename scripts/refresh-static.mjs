import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.mjs';
import { closeDatabase } from '../src/query.mjs';
import { ensureSnapshotFresh, readSnapshot } from '../src/refresh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDataFile = path.join(root, 'docs', 'data', 'dashboard-data.json');

await fs.mkdir(path.dirname(config.dataFile), { recursive: true });
try {
  await fs.copyFile(publicDataFile, config.dataFile);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

try {
  await ensureSnapshotFresh();
  const snapshot = await readSnapshot();
  if (!snapshot) {
    throw new Error('No dashboard snapshot is available.');
  }
  await fs.mkdir(path.dirname(publicDataFile), { recursive: true });
  await fs.writeFile(publicDataFile, JSON.stringify(snapshot), 'utf8');
  console.log(
    `Static data refreshed: ${snapshot.meta.rowCount} rows through ${snapshot.meta.coverageEndExclusive} (exclusive).`,
  );
} finally {
  await closeDatabase();
}
