import { addDays, yesterdayShanghai } from './time.mjs';

const MONSTERS = [
  { configId: '57', name: '醒狮鱼' },
  { configId: '59', name: '轰炸鲨' },
  { configId: '60', name: '海神' },
  { configId: '61', name: '财神爷' },
  { configId: '62', name: '火龙神' },
  { configId: '64', name: '永恒之戟' },
  { configId: '65', name: '海王蟹' },
  { configId: '66', name: '大王章鱼' },
  { configId: '67', name: '无限龙珠' },
  { configId: '68', name: '金蟾蜍' },
  { configId: '69', name: '魔术师' },
  { configId: '70', name: '宙斯' },
  { configId: '71', name: '多福多财' },
  { configId: '72', name: '阿兹特' },
  { configId: '73', name: '波塞冬' },
  { configId: '75', name: '霸王龙' },
  { configId: '76', name: '死亡之翼' },
  { configId: '74', name: '哪吒' },
  { configId: '7777', name: '嗨鲨' },
  { configId: '9', name: '灯笼鱼' },
  { configId: '54', name: '鸿运当头鱼' },
  { configId: '55', name: '海鳗' },
];

const ARENAS = ['1001', '1002', '1003'];

function hash(input) {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function random(key, min, max) {
  const unit = hash(key) / 0xffffffff;
  return min + unit * (max - min);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function generateSampleRows(now = new Date()) {
  const endDate = yesterdayShanghai(now);
  const dates = Array.from({ length: 9 }, (_, index) =>
    addDays(endDate, index - 8),
  );
  const rows = [];

  for (const statDate of dates) {
    for (const arenaId of ARENAS) {
      const dailyMonsters = MONSTERS.map((monster, index) => {
        const key = `${statDate}-${arenaId}-${monster.name}`;
        const popularity = Math.max(0.18, 1 - index / (MONSTERS.length + 2));
        const weekdayFactor = 0.92 + hash(`${statDate}-weekday`) / 0xffffffff * 0.2;
        const cost = Math.round(
          random(key, 180_000, 6_800_000) * popularity * weekdayFactor,
        );
        return {
          monsterName: monster.name,
          monsterConfigId: monster.configId,
          cost,
          key,
        };
      });
      const dailyTotalCost = dailyMonsters.reduce(
        (sum, monster) => sum + monster.cost,
        0,
      );
      const ranked = dailyMonsters
        .sort((left, right) => right.cost - left.cost)
        .slice(0, 10);

      ranked.forEach((monster, index) => {
        const attackUsers = Math.max(
          8,
          Math.round(monster.cost / random(`${monster.key}-user`, 260, 620)),
        );
        const attackMonsters = Math.max(
          attackUsers,
          Math.round(attackUsers * random(`${monster.key}-monster`, 1.1, 2.3)),
        );
        const killedUsers = Math.round(
          attackUsers * random(`${monster.key}-kill-user`, 0.18, 0.58),
        );
        const killedMonsters = Math.round(
          attackMonsters * random(`${monster.key}-kill-monster`, 0.2, 0.62),
        );

        rows.push({
          stat_date: statDate,
          arena_id: arenaId,
          config_rank: index + 1,
          monster_config_id: monster.monsterConfigId,
          monster_name: monster.monsterName,
          config_cost: monster.cost,
          daily_total_cost: dailyTotalCost,
          config_cost_ratio: round(monster.cost / dailyTotalCost),
          rtp: round(random(`${monster.key}-rtp`, 0.84, 1.14)),
          attack_user_count: attackUsers,
          killed_user_count: killedUsers,
          user_kill_rate: round(killedUsers / attackUsers),
          attack_monster_count: attackMonsters,
          killed_monster_count: killedMonsters,
          monster_kill_rate: round(killedMonsters / attackMonsters),
        });
      });
    }
  }
  return rows;
}

export const SAMPLE_MONSTER_NAMES = Object.freeze(
  MONSTERS.map((monster) => monster.name),
);
