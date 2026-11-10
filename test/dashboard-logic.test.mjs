import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateDailyByMonster,
  aggregateDailyMetrics,
  buildStaticDashboardPayload,
  buildWeeklyMonsterSeries,
  formatKbt,
  formatT,
} from '../public/dashboard-logic.js';

test('formats values with K, B and T units', () => {
  assert.equal(formatKbt(999), '999');
  assert.equal(formatKbt(1_250), '1.25K');
  assert.equal(formatKbt(2_500_000_000), '2.5B');
  assert.equal(formatKbt(3_250_000_000_000), '3.25T');
});

test('formats the daily cost axis in T units', () => {
  assert.equal(formatT(1_800_000_000_000), '1.8T');
  assert.equal(formatT(25_000_000_000_000), '25T');
});

test('aggregates rate metrics by date using the matching weights', () => {
  const rows = [
    {
      stat_date: '2026-11-09',
      config_cost: 25,
      config_cost_ratio: 0.2,
      rtp: 0.8,
      attack_user_count: 100,
      killed_user_count: 20,
      attack_monster_count: 200,
      killed_monster_count: 50,
    },
    {
      stat_date: '2026-11-09',
      config_cost: 75,
      config_cost_ratio: 0.4,
      rtp: 1.2,
      attack_user_count: 100,
      killed_user_count: 60,
      attack_monster_count: 300,
      killed_monster_count: 150,
    },
  ];
  const [point] = aggregateDailyMetrics(rows);
  assert.equal(point.config_cost, 100);
  assert.equal(point.config_cost_ratio, 0.35);
  assert.equal(point.rtp, 1.1);
  assert.equal(point.user_kill_rate, 0.4);
  assert.equal(point.monster_kill_rate, 0.4);
});

test('keeps monster series separate and uses daily_total_cost for the total', () => {
  const rows = [
    {
      stat_date: '2026-11-09',
      arena_id: '1',
      monster_config_id: '57',
      monster_name: '醒狮鱼',
      config_cost: 20,
      config_cost_ratio: 0.2,
      daily_total_cost: 100,
      rtp: 0.9,
      attack_user_count: 10,
      killed_user_count: 2,
      attack_monster_count: 20,
      killed_monster_count: 4,
    },
    {
      stat_date: '2026-11-09',
      arena_id: '1',
      monster_config_id: '59',
      monster_name: '轰炸鲨',
      config_cost: 30,
      config_cost_ratio: 0.3,
      daily_total_cost: 100,
      rtp: 1.1,
      attack_user_count: 20,
      killed_user_count: 10,
      attack_monster_count: 40,
      killed_monster_count: 20,
    },
  ];
  const result = aggregateDailyByMonster(rows);
  assert.equal(result.series.length, 2);
  assert.equal(result.series[0].points[0].config_cost, 30);
  assert.equal(result.series[0].points[0].config_cost_ratio, 0.3);
  assert.equal(result.series[1].points[0].config_cost_ratio, 0.2);
  assert.equal(result.dailyTotals[0].daily_config_cost, 100);
});

test('marks daily points below each monster seven-day average', () => {
  const rows = [];
  for (let day = 1; day <= 7; day += 1) {
    rows.push({
      stat_date: `2026-11-0${day}`,
      monster_config_id: '57',
      monster_name: '醒狮鱼',
      attack_monster_count: 100,
      killed_monster_count: day === 7 ? 10 : 50,
    });
    rows.push({
      stat_date: `2026-11-0${day}`,
      monster_config_id: '59',
      monster_name: '轰炸鲨',
      attack_monster_count: 100,
      killed_monster_count: 20,
    });
  }

  const series = buildWeeklyMonsterSeries(rows);
  const lion = series.find((monster) => monster.configId === '57');
  const shark = series.find((monster) => monster.configId === '59');
  assert.equal(lion.points.length, 7);
  assert.equal(lion.points.at(-1).belowAverage, true);
  assert.equal(shark.points.filter((point) => point.belowAverage).length, 0);
});

test('builds the static dashboard payload with client-side filters', () => {
  const rows = [
    {
      stat_date: '2026-11-09',
      arena_id: '1',
      monster_config_id: '57',
      monster_name: '醒狮鱼',
      config_rank: 1,
      config_cost: 20,
      daily_total_cost: 100,
      config_cost_ratio: 0.2,
    },
    {
      stat_date: '2026-11-09',
      arena_id: '1',
      monster_config_id: '59',
      monster_name: '轰炸鲨',
      config_rank: 2,
      config_cost: 30,
      daily_total_cost: 100,
      config_cost_ratio: 0.3,
    },
  ];
  const payload = buildStaticDashboardPayload(
    {
      rows,
      meta: {
        updatedAtShanghai: '2026-11-10 15:00',
      },
    },
    {
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      arenaId: '1',
      monsterNames: ['轰炸鲨'],
    },
  );
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].monster_name, '轰炸鲨');
  assert.equal(payload.meta.yesterdayTopMonsters.length, 2);
});
