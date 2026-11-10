import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(root, 'public');
const docsDirectory = path.join(root, 'docs');
const snapshotFile = path.join(root, 'data', 'snapshot.json');
const outputFile = path.join(docsDirectory, 'data', 'dashboard-data.json');

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.cp(publicDirectory, docsDirectory, {
  recursive: true,
  force: true,
});

const indexPath = path.join(docsDirectory, 'index.html');
const indexHtml = await fs.readFile(indexPath, 'utf8');
await fs.writeFile(
  indexPath,
  indexHtml.replace(
    'data-dashboard-mode="server"',
    'data-dashboard-mode="static"',
  ),
  'utf8',
);

await fs.copyFile(snapshotFile, outputFile);
console.log(`Static data written to ${path.relative(root, outputFile)}.`);
