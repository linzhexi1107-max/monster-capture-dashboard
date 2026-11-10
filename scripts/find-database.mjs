import mysql from 'mysql2/promise';

process.loadEnvFile?.('.env');

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: 'information_schema',
  connectTimeout: 10_000,
  enableKeepAlive: false,
});

try {
  const [databases] = await connection.query('SHOW DATABASES');
  const names = databases.map((row) => Object.values(row)[0]);
  console.log('Accessible databases:');
  for (const name of names) console.log(`- ${name}`);

  const [tables] = await connection.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_name IN (
        'ods_game_catch_attack_balance_record',
        'ods_game_catch_special_monster_reward_detail'
      )
      ORDER BY table_schema, table_name`,
  );
  console.log('Business table schemas:');
  for (const table of tables) {
    console.log(`- ${table.table_schema}.${table.table_name}`);
  }
} catch (error) {
  console.error(`Metadata query failed: ${error.code || 'UNKNOWN'} - ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
