import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = 'linzhexi1107-max';
const repo = 'monster-capture-dashboard';
const token = process.env.GITHUB_TOKEN;
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const filePath = path.join(root, 'docs', 'data', 'dashboard-data.json');
const relativePath = 'docs/data/dashboard-data.json';

if (!token) throw new Error('GITHUB_TOKEN is required.');

async function api(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'codex-dashboard-publisher',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${endpoint} failed: ${response.status} ${payload?.message || text}`,
    );
  }
  return payload;
}

const current = await api(`/repos/${owner}/${repo}/contents/${relativePath}`);
const content = await fs.readFile(filePath);
await api(`/repos/${owner}/${repo}/contents/${relativePath}`, {
  method: 'PUT',
  body: {
    message: 'Update dashboard snapshot',
    content: content.toString('base64'),
    sha: current.sha,
  },
});

console.log(`Published ${relativePath}.`);
