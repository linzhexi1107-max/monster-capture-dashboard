import path from 'node:path';

try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

function booleanValue(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

export const config = Object.freeze({
  port: Number(process.env.PORT || 3000),
  mysql: {
    host: process.env.MYSQL_HOST || '',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || '',
    ssl: booleanValue(process.env.MYSQL_SSL),
    sslRejectUnauthorized: booleanValue(
      process.env.MYSQL_SSL_REJECT_UNAUTHORIZED,
      true,
    ),
  },
  dataStartDate: process.env.DATA_START_DATE || '2026-10-01',
  dataFile: path.resolve(process.env.DATA_FILE || 'data/snapshot.json'),
  refreshHour: 8,
});

export function hasDatabaseConfig() {
  const { host, user, database } = config.mysql;
  return Boolean(host && user && database);
}
