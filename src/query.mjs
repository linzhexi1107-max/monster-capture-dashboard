import mysql from 'mysql2/promise';
import { config } from './config.mjs';

const DASHBOARD_QUERY = `
WITH config_mapping AS (
    SELECT 57   AS monster_config_id, '醒狮鱼'   AS monster_name
    UNION ALL SELECT 59,   '轰炸鲨'
    UNION ALL SELECT 60,   '海神'
    UNION ALL SELECT 61,   '财神爷'
    UNION ALL SELECT 62,   '火龙神'
    UNION ALL SELECT 64,   '永恒之戟'
    UNION ALL SELECT 65,   '海王蟹'
    UNION ALL SELECT 66,   '大王章鱼'
    UNION ALL SELECT 67,   '无限龙珠'
    UNION ALL SELECT 68,   '金蟾蜍'
    UNION ALL SELECT 69,   '魔术师'
    UNION ALL SELECT 70,   '宙斯'
    UNION ALL SELECT 71,   '多福多财'
    UNION ALL SELECT 72,   '阿兹特'
    UNION ALL SELECT 73,   '波塞冬'
    UNION ALL SELECT 75,   '霸王龙'
    UNION ALL SELECT 76,   '死亡之翼'
    UNION ALL SELECT 74,   '哪吒'
    UNION ALL SELECT 7777, '嗨鲨'
    UNION ALL SELECT 9,    '灯笼鱼'
    UNION ALL SELECT 54,   '鸿运当头鱼'
    UNION ALL SELECT 55,   '海鳗'
),
attack_daily_config AS (
    SELECT
        DATE(finish_time) AS stat_date,
        arena_id,
        monster_config_id,
        SUM(COALESCE(cost_value, 0)) AS config_cost,
        SUM(COALESCE(earn_value, 0)) AS config_earn,
        COUNT(DISTINCT player_id) AS attack_user_count,
        COUNT(DISTINCT CASE
            WHEN monster_id IS NOT NULL
             AND monster_id <> ''
            THEN monster_id
        END) AS attack_monster_count
    FROM ods_game_catch_attack_balance_record
    WHERE finish_time >= ?
      AND finish_time < ?
      AND record_type = 'attack'
      AND monster_config_id <> 0
    GROUP BY
        DATE(finish_time),
        arena_id,
        monster_config_id
),
kill_daily_config AS (
    SELECT
        DATE(create_time) AS stat_date,
        arena_id,
        monster_config_id,
        COUNT(DISTINCT player_id) AS killed_user_count,
        COUNT(DISTINCT CASE
            WHEN monster_id IS NOT NULL
             AND monster_id <> ''
            THEN monster_id
        END) AS killed_monster_count
    FROM ods_game_catch_special_monster_reward_detail
    WHERE create_time >= ?
      AND create_time < ?
      AND monster_config_id <> 0
      AND (
            (
                monster_config_id = 61
                AND reward_money > 0
            )
            OR (
                monster_config_id <> 61
                AND JSON_UNQUOTE(
                    JSON_EXTRACT(extra_json, '$.death')
                ) = '0'
            )
      )
    GROUP BY
        DATE(create_time),
        arena_id,
        monster_config_id
),
daily_ranked AS (
    SELECT
        a.*,
        SUM(a.config_cost) OVER (
            PARTITION BY a.stat_date, a.arena_id
        ) AS daily_total_cost,
        ROW_NUMBER() OVER (
            PARTITION BY a.stat_date, a.arena_id
            ORDER BY
                a.config_cost DESC,
                a.monster_config_id
        ) AS config_rank
    FROM attack_daily_config AS a
)
SELECT
    a.stat_date,
    a.arena_id,
    a.config_rank,
    a.monster_config_id,
    COALESCE(m.monster_name, '未映射') AS monster_name,
    a.config_cost,
    a.daily_total_cost,
    ROUND(a.config_cost / NULLIF(a.daily_total_cost, 0), 4) AS config_cost_ratio,
    ROUND(a.config_earn / NULLIF(a.config_cost, 0), 4) AS rtp,
    a.attack_user_count,
    COALESCE(k.killed_user_count, 0) AS killed_user_count,
    ROUND(
        COALESCE(k.killed_user_count, 0)
        / NULLIF(a.attack_user_count, 0),
        4
    ) AS user_kill_rate,
    a.attack_monster_count,
    COALESCE(k.killed_monster_count, 0) AS killed_monster_count,
    ROUND(
        COALESCE(k.killed_monster_count, 0)
        / NULLIF(a.attack_monster_count, 0),
        4
    ) AS monster_kill_rate
FROM daily_ranked AS a
LEFT JOIN kill_daily_config AS k
  ON k.stat_date = a.stat_date
 AND k.arena_id = a.arena_id
 AND k.monster_config_id = a.monster_config_id
LEFT JOIN config_mapping AS m
  ON m.monster_config_id = a.monster_config_id
WHERE a.config_rank <= 10
ORDER BY
    a.stat_date,
    a.arena_id,
    a.config_rank
`;

let pool;

function getPool() {
  if (!pool) {
    const ssl = config.mysql.ssl
      ? { rejectUnauthorized: config.mysql.sslRejectUnauthorized }
      : undefined;
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      timezone: '+08:00',
      dateStrings: true,
      decimalNumbers: true,
      charset: 'utf8mb4',
      ssl,
    });
  }
  return pool;
}

function numeric(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeDashboardRow(row) {
  return {
    stat_date: String(row.stat_date).slice(0, 10),
    arena_id: String(row.arena_id),
    config_rank: numeric(row.config_rank),
    monster_config_id: String(row.monster_config_id),
    monster_name: row.monster_name || '未映射',
    config_cost: numeric(row.config_cost),
    daily_total_cost: numeric(row.daily_total_cost),
    config_cost_ratio: numeric(row.config_cost_ratio),
    rtp: numeric(row.rtp),
    attack_user_count: numeric(row.attack_user_count),
    killed_user_count: numeric(row.killed_user_count),
    user_kill_rate: numeric(row.user_kill_rate),
    attack_monster_count: numeric(row.attack_monster_count),
    killed_monster_count: numeric(row.killed_monster_count),
    monster_kill_rate: numeric(row.monster_kill_rate),
  };
}

export async function fetchDashboardRows(startDate, endDateExclusive) {
  const rangeStart = `${startDate} 00:00:00`;
  const rangeEnd = `${endDateExclusive} 00:00:00`;
  const [rows] = await getPool().execute(DASHBOARD_QUERY, [
    rangeStart,
    rangeEnd,
    rangeStart,
    rangeEnd,
  ]);
  return rows.map(normalizeDashboardRow);
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
