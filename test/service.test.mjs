import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSampleRows } from '../src/sample-data.mjs';
import {
  buildRecentTopMonsters,
  buildTopMonstersForDate,
  filterDataset,
} from '../src/service.mjs';

const now = new Date('2026-11-10T04:00:00.000Z');

test('sample data includes nine days, top ten rows and config ids', () => {
  const rows = generateSampleRows(now);
  assert.equal(rows.length, 9 * 3 * 10);
  assert.equal(new Set(rows.map((row) => row.stat_date)).size, 9);
  assert.equal(rows.at(-1).stat_date, '2026-11-09');
  assert.match(rows[0].monster_config_id, /^\d+$/);
});

test('filters by date range, arena and monster name', () => {
  const rows = generateSampleRows(now);
  const filtered = filterDataset(rows, {
    startDate: '2026-11-07',
    endDate: '2026-11-08',
    arenaId: '1002',
    monsterName: '醒狮鱼',
  });
  assert.ok(filtered.length > 0);
  for (const row of filtered) {
    assert.ok(row.stat_date >= '2026-11-07');
    assert.ok(row.stat_date <= '2026-11-08');
    assert.equal(row.arena_id, '1002');
    assert.equal(row.monster_name, '醒狮鱼');
  }
});

test('filters by multiple monster names without aggregating them', () => {
  const rows = generateSampleRows(now);
  const availableNames = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.stat_date === '2026-11-09' && row.arena_id === '1001',
        )
        .map((row) => row.monster_name),
    ),
  ].slice(0, 2);
  const filtered = filterDataset(rows, {
    startDate: '2026-11-09',
    endDate: '2026-11-09',
    arenaId: '1001',
    monsterNames: availableNames,
  });
  assert.deepEqual(
    [...new Set(filtered.map((row) => row.monster_name))].sort(),
    availableNames.sort(),
  );
  assert.equal(
    new Set(filtered.map((row) => row.monster_config_id)).size,
    2,
  );
});

test('leaves result empty when no rows match', () => {
  const rows = generateSampleRows(now);
  const filtered = filterDataset(rows, {
    startDate: '2025-01-01',
    endDate: '2025-01-02',
  });
  assert.deepEqual(filtered, []);
});

test('builds a top ten ranking from the latest available seven days', () => {
  const rows = generateSampleRows(now).filter(
    (row) => row.stat_date >= '2026-11-07',
  );
  const ranking = buildRecentTopMonsters(rows, '2026-11-09');
  assert.equal(ranking.periodStart, '2026-11-07');
  assert.equal(ranking.periodEnd, '2026-11-09');
  assert.equal(ranking.topMonsters.length, 10);
  assert.ok(
    ranking.topMonsters.every(
      (monster, index, list) =>
        index === 0 ||
        list[index - 1].config_cost_ratio >= monster.config_cost_ratio,
    ),
  );
});

test('builds the top three monsters for the latest day by cost value', () => {
  const rows = generateSampleRows(now);
  const topMonsters = buildTopMonstersForDate(rows, '2026-11-09', 3);
  assert.equal(topMonsters.length, 3);
  assert.ok(
    topMonsters[0].config_cost >= topMonsters[1].config_cost &&
      topMonsters[1].config_cost >= topMonsters[2].config_cost,
  );
  assert.ok(topMonsters.every((monster) => monster.config_cost_ratio > 0));
});
