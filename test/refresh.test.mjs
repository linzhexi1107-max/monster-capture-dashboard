import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDashboardRows } from '../src/refresh.mjs';

test('keeps historical rows and replaces only the refreshed date range', () => {
  const existing = [
    {
      stat_date: '2026-11-07',
      arena_id: '1',
      monster_name: '醒狮鱼',
      config_rank: 1,
    },
    {
      stat_date: '2026-11-08',
      arena_id: '1',
      monster_name: '醒狮鱼',
      config_rank: 2,
    },
  ];
  const incoming = [
    {
      stat_date: '2026-11-08',
      arena_id: '1',
      monster_name: '醒狮鱼',
      config_rank: 1,
    },
    {
      stat_date: '2026-11-09',
      arena_id: '1',
      monster_name: '醒狮鱼',
      config_rank: 1,
    },
  ];

  const merged = mergeDashboardRows(
    existing,
    incoming,
    '2026-11-08',
    '2026-11-10',
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].stat_date, '2026-11-07');
  assert.equal(
    merged.find((row) => row.stat_date === '2026-11-08').config_rank,
    1,
  );
  assert.equal(merged.at(-1).stat_date, '2026-11-09');
});
