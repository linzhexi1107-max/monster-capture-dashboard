import mysql from 'mysql2/promise';

process.loadEnvFile?.('.env');

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'information_schema',
  connectTimeout: 10_000,
  enableKeepAlive: false,
});

try {
  const [rows] = await connection.query('SELECT 1 AS connection_ok');
  console.log(
    rows[0]?.connection_ok === 1
      ? 'MySQL connection succeeded.'
      : 'MySQL connection returned an unexpected result.',
  );
} catch (error) {
  console.error(`MySQL query failed: ${error.code || 'UNKNOWN'} - ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
