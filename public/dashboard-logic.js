export function formatKbt(value, maxFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  const absolute = Math.abs(number);
  let divisor = 1;
  let unit = '';
  if (absolute >= 1e12) {
    divisor = 1e12;
    unit = 'T';
  } else if (absolute >= 1e9) {
    divisor = 1e9;
    unit = 'B';
  } else if (absolute >= 1e3) {
    divisor = 1e3;
    unit = 'K';
  }

  const scaled = number / divisor;
  const digits =
    Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : maxFractionDigits;
  return `${scaled.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}${unit}`;
}

export function formatT(value, maxFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const scaled = number / 1e12;
  const digits =
    Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : maxFractionDigits;
  return `${scaled.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}T`;
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function aggregateDailyMetrics(rows) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.stat_date) || {
      date: row.stat_date,
      cost: 0,
      costRatioNumerator: 0,
      rtpNumerator: 0,
      attackUsers: 0,
      killedUsers: 0,
      attackMonsters: 0,
      killedMonsters: 0,
    };
    const cost = safeNumber(row.config_cost);
    current.cost += cost;
    current.costRatioNumerator += cost * safeNumber(row.config_cost_ratio);
    current.rtpNumerator += cost * safeNumber(row.rtp);
    current.attackUsers += safeNumber(row.attack_user_count);
    current.killedUsers += safeNumber(row.killed_user_count);
    current.attackMonsters += safeNumber(row.attack_monster_count);
    current.killedMonsters += safeNumber(row.killed_monster_count);
    map.set(row.stat_date, current);
  }

  return [...map.values()]
    .map((point) => ({
      date: point.date,
      config_cost: point.cost,
      config_cost_ratio: point.cost
        ? point.costRatioNumerator / point.cost
        : 0,
      rtp: point.cost ? point.rtpNumerator / point.cost : 0,
      user_kill_rate: point.attackUsers
        ? point.killedUsers / point.attackUsers
        : 0,
      monster_kill_rate: point.attackMonsters
        ? point.killedMonsters / point.attackMonsters
        : 0,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function aggregateDailyByMonster(rows) {
  const monsters = new Map();
  const dailyTotalsByScope = new Map();

  for (const row of rows) {
    const scope = `${row.stat_date}|${row.arena_id}`;
    const dailyTotal = safeNumber(row.daily_total_cost);
    dailyTotalsByScope.set(
      scope,
      Math.max(dailyTotalsByScope.get(scope) || 0, dailyTotal),
    );

    const configId = String(row.monster_config_id || row.monster_name);
    const monster = monsters.get(configId) || {
      configId,
      name: row.monster_name,
      byDate: new Map(),
    };
    const day = monster.byDate.get(row.stat_date) || {
      date: row.stat_date,
      cost: 0,
      costRatioNumerator: 0,
      rtpNumerator: 0,
      attackUsers: 0,
      killedUsers: 0,
      attackMonsters: 0,
      killedMonsters: 0,
    };
    const cost = safeNumber(row.config_cost);
    day.cost += cost;
    day.costRatioNumerator += cost * safeNumber(row.config_cost_ratio);
    day.rtpNumerator += cost * safeNumber(row.rtp);
    day.attackUsers += safeNumber(row.attack_user_count);
    day.killedUsers += safeNumber(row.killed_user_count);
    day.attackMonsters += safeNumber(row.attack_monster_count);
    day.killedMonsters += safeNumber(row.killed_monster_count);
    monster.byDate.set(row.stat_date, day);
    monsters.set(configId, monster);
  }

  const series = [...monsters.values()]
    .map((monster) => ({
      configId: monster.configId,
      name: monster.name,
      points: [...monster.byDate.values()]
        .map((day) => ({
          date: day.date,
          config_cost: day.cost,
          config_cost_ratio: day.cost
            ? day.costRatioNumerator / day.cost
            : 0,
          rtp: day.cost ? day.rtpNumerator / day.cost : 0,
          user_kill_rate: day.attackUsers
            ? day.killedUsers / day.attackUsers
            : 0,
          monster_kill_rate: day.attackMonsters
            ? day.killedMonsters / day.attackMonsters
            : 0,
        }))
        .sort((left, right) => left.date.localeCompare(right.date)),
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'zh-CN') ||
      left.configId.localeCompare(right.configId, 'zh-CN', { numeric: true }),
    );

  const totalsByDate = new Map();
  for (const [scope, value] of dailyTotalsByScope) {
    const date = scope.slice(0, 10);
    totalsByDate.set(date, (totalsByDate.get(date) || 0) + value);
  }
  const dailyTotals = [...totalsByDate.entries()]
    .map(([date, dailyTotalCost]) => ({
      date,
      daily_config_cost: dailyTotalCost,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return { series, dailyTotals };
}

export function buildWeeklyMonsterSeries(rows) {
  const dates = [...new Set(rows.map((row) => row.stat_date))]
    .sort()
    .slice(-7);
  const includedDates = new Set(dates);
  const monsters = new Map();

  for (const row of rows) {
    if (!includedDates.has(row.stat_date)) continue;
    const configId = String(row.monster_config_id || '');
    const current = monsters.get(configId) || {
      configId,
      name: row.monster_name,
      byDate: new Map(),
    };
    const day = current.byDate.get(row.stat_date) || {
      attackMonsters: 0,
      killedMonsters: 0,
    };
    day.attackMonsters += safeNumber(row.attack_monster_count);
    day.killedMonsters += safeNumber(row.killed_monster_count);
    current.byDate.set(row.stat_date, day);
    monsters.set(configId, current);
  }

  return [...monsters.values()]
    .map((monster) => {
      const rawPoints = dates
        .map((date) => {
          const day = monster.byDate.get(date);
          return day
            ? {
                date,
                value: day.attackMonsters
                  ? day.killedMonsters / day.attackMonsters
                  : 0,
              }
            : null;
        })
        .filter(Boolean);
      const average =
        rawPoints.reduce((sum, point) => sum + point.value, 0) /
        Math.max(rawPoints.length, 1);
      return {
        configId: monster.configId,
        name: monster.name,
        average,
        points: rawPoints.map((point) => ({
          ...point,
          belowAverage: point.value < average,
        })),
      };
    })
    .filter((monster) => monster.points.length)
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'zh-CN') ||
      left.configId.localeCompare(right.configId, 'zh-CN', { numeric: true }),
    );
}

export function filterDashboardRows(rows, filters = {}) {
  const monsterNames = (filters.monsterNames || [])
    .map((name) => String(name).trim())
    .filter(Boolean);
  const monsterNameSet = new Set(monsterNames);
  return rows.filter((row) => {
    if (filters.startDate && row.stat_date < filters.startDate) return false;
    if (filters.endDate && row.stat_date > filters.endDate) return false;
    if (filters.arenaId && String(row.arena_id) !== String(filters.arenaId)) {
      return false;
    }
    if (monsterNameSet.size && !monsterNameSet.has(row.monster_name)) {
      return false;
    }
    return true;
  });
}

export function buildTopMonstersForRange(
  rows,
  startDate,
  endDate,
  limit = 10,
) {
  if (!startDate || !endDate) return [];
  const rangeRows = filterDashboardRows(rows, { startDate, endDate });
  const dailyTotals = new Map();
  const monsters = new Map();

  for (const row of rangeRows) {
    const scope = `${row.stat_date}|${row.arena_id}`;
    dailyTotals.set(
      scope,
      Math.max(dailyTotals.get(scope) || 0, safeNumber(row.daily_total_cost)),
    );
    const configId = String(row.monster_config_id || row.monster_name);
    const monster = monsters.get(configId) || {
      monster_config_id: configId,
      monster_name: row.monster_name,
      config_cost: 0,
    };
    monster.config_cost += safeNumber(row.config_cost);
    monsters.set(configId, monster);
  }

  const totalCost = [...dailyTotals.values()].reduce(
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

export function buildTopMonstersForDate(rows, date, limit = 3) {
  return buildTopMonstersForRange(rows, date, date, limit);
}

export function buildStaticDashboardPayload(snapshot, filters = {}) {
  const rows = snapshot.rows || [];
  const dates = [...new Set(rows.map((row) => row.stat_date))].sort();
  const arenas = [...new Set(rows.map((row) => String(row.arena_id)))].sort(
    (left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }),
  );
  const monsters = [...new Set(rows.map((row) => row.monster_name))].sort(
    (left, right) => left.localeCompare(right, 'zh-CN'),
  );
  const rankingRows = filterDashboardRows(rows, { arenaId: filters.arenaId });
  const rankingEnd = filters.endDate || dates.at(-1) || '';
  const recentStart = rankingEnd ? addDays(rankingEnd, -6) : '';
  const recentRows = filterDashboardRows(rankingRows, {
    startDate: recentStart,
    endDate: rankingEnd,
  });
  const recentDates = [...new Set(recentRows.map((row) => row.stat_date))].sort();
  const recentTopRows = filterDashboardRows(rankingRows, {
    startDate: recentStart,
    endDate: rankingEnd,
  });
  const recentTopMonsters = buildTopMonstersForRange(
    recentTopRows,
    recentStart,
    rankingEnd,
    10,
  );
  const data = filterDashboardRows(rows, filters).sort((left, right) => {
    if (left.stat_date !== right.stat_date) {
      return right.stat_date.localeCompare(left.stat_date);
    }
    return (
      String(left.arena_id).localeCompare(String(right.arena_id), 'zh-CN', {
        numeric: true,
      }) || left.config_rank - right.config_rank
    );
  });
  const yesterday = dates.at(-1) || null;

  return {
    data,
    meta: {
      source: 'live',
      totalRows: rows.length,
      filteredRows: data.length,
      availableArenas: arenas,
      availableMonsters: monsters,
      minDate: dates[0] || null,
      maxDate: yesterday,
      updatedAt: snapshot.meta?.updatedAt || null,
      updatedAtShanghai: snapshot.meta?.updatedAtShanghai || null,
      refreshHour: 8,
      timezone: 'Asia/Shanghai',
      warning: null,
      filters,
      recentTopPeriod: {
        start: recentDates[0] || recentStart,
        end: recentDates.at(-1) || rankingEnd,
      },
      recentTopMonsters,
      yesterdayTopDate: yesterday,
      yesterdayTopMonsters: buildTopMonstersForDate(
        filterDashboardRows(rows, { arenaId: filters.arenaId }),
        yesterday,
        3,
      ),
    },
  };
}
