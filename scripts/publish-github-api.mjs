import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = 'linzhexi1107-max';
const repo = 'monster-capture-dashboard';
const token = process.env.GITHUB_TOKEN;
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'repo-github',
);

if (!token) {
  throw new Error('GITHUB_TOKEN is required.');
}

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

async function walk(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute, relative)));
    } else if (entry.isFile()) {
      files.push({ relative, absolute });
    }
  }
  return files;
}

let parentSha = null;
try {
  const currentRef = await api(`/repos/${owner}/${repo}/git/ref/heads/main`);
  parentSha = currentRef.object.sha;
} catch (error) {
  if (
    !String(error.message).includes('404') &&
    !String(error.message).includes('409')
  ) {
    throw error;
  }
  await api(`/repos/${owner}/${repo}/contents/.initialization`, {
    method: 'PUT',
    body: {
      message: 'Initialize repository',
      content: Buffer.from('initialize\n').toString('base64'),
    },
  });
  const initializedRef = await api(
    `/repos/${owner}/${repo}/git/ref/heads/main`,
  );
  parentSha = initializedRef.object.sha;
}

const files = (await walk(root)).sort((left, right) =>
  left.relative.localeCompare(right.relative),
);
const tree = [];

for (const file of files) {
  const content = await fs.readFile(file.absolute);
  const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    body: {
      content: content.toString('base64'),
      encoding: 'base64',
    },
  });
  tree.push({
    path: file.relative,
    mode: '100644',
    type: 'blob',
    sha: blob.sha,
  });
}

const createdTree = await api(`/repos/${owner}/${repo}/git/trees`, {
  method: 'POST',
  body: { tree },
});
const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
  method: 'POST',
  body: {
    message: 'Initial GitHub Pages dashboard',
    tree: createdTree.sha,
    parents: parentSha ? [parentSha] : [],
  },
});

await api(`/repos/${owner}/${repo}/git/refs/heads/main`, {
  method: 'PATCH',
  body: { sha: commit.sha, force: false },
});

try {
  await api(`/repos/${owner}/${repo}/pages`, {
    method: 'POST',
    body: { build_type: 'workflow' },
  });
} catch (error) {
  if (!String(error.message).includes('409')) throw error;
  await api(`/repos/${owner}/${repo}/pages`, {
    method: 'PUT',
    body: { build_type: 'workflow' },
  });
}

console.log(`Published ${files.length} files to ${owner}/${repo}.`);
console.log(`Commit: ${commit.sha}`);
