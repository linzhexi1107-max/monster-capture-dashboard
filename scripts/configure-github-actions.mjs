import fs from 'node:fs/promises';
import sodium from 'tweetsodium';

const owner = 'linzhexi1107-max';
const repo = 'monster-capture-dashboard';
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error('GITHUB_TOKEN is required.');
}

async function api(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'codex-dashboard-configurator',
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

const env = {};
const envText = await fs.readFile('.env', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const secretNames = [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
];
const publicKey = await api(
  `/repos/${owner}/${repo}/actions/secrets/public-key`,
);
const key = Buffer.from(publicKey.key, 'base64');

for (const name of secretNames) {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  const encrypted = sodium.seal(Buffer.from(value), key);
  await api(`/repos/${owner}/${repo}/actions/secrets/${name}`, {
    method: 'PUT',
    body: {
      encrypted_value: Buffer.from(encrypted).toString('base64'),
      key_id: publicKey.key_id,
    },
  });
}

await api(
  `/repos/${owner}/${repo}/actions/workflows/update-and-deploy.yml/dispatches`,
  {
    method: 'POST',
    body: { ref: 'main' },
  },
);

console.log(`Configured secrets: ${secretNames.join(', ')}`);
console.log('Triggered update-and-deploy.yml on main.');
