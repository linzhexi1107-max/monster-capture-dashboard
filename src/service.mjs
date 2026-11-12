import { config, hasDatabaseConfig } from './config.mjs';
import { generateSampleRows } from './sample-data.mjs';
import { ensureSnapshotFresh, readSnapshot } from './refresh.mjs';
import { addDays, compareDateStrings } from './time.mjs';
import { buildDailyAnomalyReport } from '../public/dashboard-logic.js';

function makeMeta(rows, source, snapshot, warning = null) {
  const arenas = [...new Set(rows.map((row) => String(row.arena_id)))].sort(
    (left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }),
  );
  const monsters = [...new Set(rows.map((row) => row.monster_name))].sort(
    (left, right) => left.localeCompare(right, 'zh-CN'),
  );
  const dates = [...new Set(rows.map((row) => row.stat_date))].sort();
  return {
    source,
    totalRows: rows.length,
    availableArenas: arenas,
    availableMonsters: monsters,
    minDate: dates[0] || null,
    maxDate: dates.at(-1) || null,
    updatedAt: snapshot?.meta?.updatedAt || null,
    updatedAtShanghai: snapshot?.meta?.updatedAtShanghai || null,
    coverageEndExclusive: snapshot?.meta?.coverageEndExclusive || null,
    refreshHour: config.refreshHour,
    timezone: 'Asia/Shanghai',
    warning,
  };
}

async function loadLiveDataset() {
  try {
    const freshSnapshot = await ensureSnapshotFresh();
    return {
      rows: freshSnapshot?.rows || [],
      source: 'live',
      snapshot: freshSnapshot,
      warning: null,
    };
  } catch (error) {
    const staleSnapshot = await readSnapshot();
    if (staleSnapshot?.mode === 'live') {
      return {
        rows: staleSnapshot.rows || [],
        source: 'live',
        snapshot: staleSnapshot,
        warning: `数据库刷新失败，当前展示最近一次成功数据：${error.message}`,
      };
    }
    throw error;
  }
}

export async function getDataset() {
  if (hasDatabaseConfig()) {
    return loadLiveDataset();
  }
  return {
    rows: generateSampleRows(),
    source: 'sample',
    snapshot: null,
    warning: '当前为演示数据。配置 MySQL 后，页面会自动切换为真实数据。',
  };
}

export function filterDataset(rows, filters = {}) {
  const startDate = filters.startDate || '';
  const endDate = filters.endDate || '';
  const arenaId = String(filters.arenaId || '');
  const monsterNames = (
    Array.isArray(filters.monsterNames)
      ? filters.monsterNames
      : filters.monsterName
        ? [filters.monsterName]
        : []
  )
    .map((value) => String(value).trim())
    .filter(Boolean);
  const monsterNameSet = new Set(monsterNames);

  return rows.filter((row) => {
    if (startDate && compareDateStrings(row.stat_date, startDate) < 0) {
      return false;
    }
    if (endDate && compareDateStrings(row.stat_date, endDate) > 0) {
      return false;
    }
    if (arenaId && String(row.arena_id) !== arenaId) {
      return false;
    }
    if (monsterNameSet.size && !monsterNameSet.has(row.monster_name)) {
      return false;
    }
    return true;
  });
}

export function buildRecentTopMonsters(rows, endDate) {
  if (!endDate) {
    return {
      periodStart: null,
      periodEnd: null,
      topMonsters: [],
    };
  }
  const requestedStart = addDays(endDate, -6);
  const periodRows = filterDataset(rows, {
    startDate: requestedStart,
    endDate,
  });
  const availableDates = [...new Set(periodRows.map((row) => row.stat_date))].sort();
  const dailyTotals = new Map();
  const monsters = new Map();

  for (const row of periodRows) {
    const scope = `${row.stat_date}|${row.arena_id}`;
    const dailyTotal = Number(row.daily_total_cost) || 0;
    dailyTotals.set(scope, Math.max(dailyTotals.get(scope) || 0, dailyTotal));

    const configId = String(row.monster_config_id || row.monster_name);
    const current = monsters.get(configId) || {
      monster_config_id: configId,
      monster_name: row.monster_name,
      config_cost: 0,
    };
    current.config_cost += Number(row.config_cost) || 0;
    monsters.set(configId, current);
  }

  const totalCost = [...dailyTotals.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const topMonsters = [...monsters.values()]
    .map((monster) => ({
      ...monster,
      config_cost_ratio: totalCost ? monster.config_cost / totalCost : 0,
    }))
    .sort(
      (left, right) =>
        right.config_cost_ratio - left.config_cost_ratio ||
        right.config_cost - left.config_cost,
    )
    .slice(0, 10);

  return {
    periodStart: availableDates[0] || requestedStart,
    periodEnd: availableDates.at(-1) || endDate,
    topMonsters,
  };
}

export function buildTopMonstersForDate(rows, date, limit = 3) {
  if (!date) return [];

  const dayRows = filterDataset(rows, {
    startDate: date,
    endDate: date,
  });
  const dailyTotalsByScope = new Map();
  const monsters = new Map();

  for (const row of dayRows) {
    const scope = `${row.stat_date}|${row.arena_id}`;
    const dailyTotal = Number(row.daily_total_cost) || 0;
    dailyTotalsByScope.set(
      scope,
      Math.max(dailyTotalsByScope.get(scope) || 0, dailyTotal),
    );

    const configId = String(row.monster_config_id || row.monster_name);
    const current = monsters.get(configId) || {
      monster_config_id: configId,
      monster_name: row.monster_name,
      config_cost: 0,
    };
    current.config_cost += Number(row.config_cost) || 0;
    monsters.set(configId, current);
  }

  const totalCost = [...dailyTotalsByScope.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  return [...monsters.values()]
    .map((monster) => ({
      ...monster,
      config_cost_ratio: totalCost ? monster.config_cost / totalCost : 0,
    }))
    .sort(
      (left, right) =>
        right.config_cost - left.config_cost ||
        right.config_cost_ratio - left.config_cost_ratio,
    )
    .slice(0, limit);
}

export async function getDashboard(filters = {}) {
  const dataset = await getDataset();
  const baseMeta = makeMeta(
    dataset.rows,
    dataset.source,
    dataset.snapshot,
    dataset.warning,
  );
  const rankingEndDate = filters.endDate || baseMeta.maxDate;
  const rankingRows = filterDataset(dataset.rows, {
    arenaId: filters.arenaId,
  });
  const recentRanking = buildRecentTopMonsters(rankingRows, rankingEndDate);
  const yesterdayTopMonsters = buildTopMonstersForDate(
    rankingRows,
    baseMeta.maxDate,
    3,
  );
  const rows = filterDataset(dataset.rows, filters).sort((left, right) => {
    if (left.stat_date !== right.stat_date) {
      return right.stat_date.localeCompare(left.stat_date);
    }
    if (left.arena_id !== right.arena_id) {
      return String(left.arena_id).localeCompare(String(right.arena_id), 'zh-CN', {
        numeric: true,
      });
    }
    return left.config_rank - right.config_rank;
  });
  return {
    data: rows,
    meta: {
      ...baseMeta,
      filteredRows: rows.length,
      filters,
      recentTopPeriod: {
        start: recentRanking.periodStart,
        end: recentRanking.periodEnd,
      },
      recentTopMonsters: recentRanking.topMonsters,
      yesterdayTopDate: baseMeta.maxDate,
      yesterdayTopMonsters,
      dailyAnomalyReport: buildDailyAnomalyReport(
        dataset.rows,
        baseMeta.maxDate,
      ),
    },
  };
}
