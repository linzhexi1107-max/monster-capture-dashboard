import mysql from 'mysql2/promise';

process.loadEnvFile?.('.env');

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectTimeout: 10_000,
  enableKeepAlive: false,
});

const tables = [
  'ods_game_catch_attack_balance_record',
  'ods_game_catch_special_monster_reward_detail',
];

try {
  for (const table of tables) {
    await connection.query(`SELECT 1 FROM \`${table}\` LIMIT 1`);
    console.log(`Readable: ${table}`);
  }
} catch (error) {
  console.error(`Table check failed: ${error.code || 'UNKNOWN'} - ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
