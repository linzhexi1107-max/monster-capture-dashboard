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

try {
  const [rows] = await connection.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name IN (
          'ods_game_catch_attack_balance_record',
          'ods_game_catch_special_monster_reward_detail'
        )
        AND (
          column_name LIKE '%cost%'
          OR column_name LIKE '%value%'
          OR column_name LIKE '%money%'
        )
      ORDER BY table_name, ordinal_position`,
    [process.env.MYSQL_DATABASE],
  );
  for (const row of rows) {
    console.log(`${row.table_name}.${row.column_name} (${row.data_type})`);
  }
} catch (error) {
  console.error(`Column inspection failed: ${error.code || 'UNKNOWN'} - ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
