import fs from 'node:fs/promises';
import path from 'node:path';
import { config, hasDatabaseConfig } from './config.mjs';
import { fetchDashboardRows } from './query.mjs';
import {
  addDays,
  formatShanghaiDateTime,
  isDateString,
  millisecondsUntilNextRefresh,
  todayShanghai,
  yesterdayShanghai,
} from './time.mjs';

let activeRefresh;

function rowKey(row) {
  return `${row.stat_date}|${row.arena_id}|${row.monster_name}`;
}

function mergeRows(existingRows, incomingRows, fromDate, endDateExclusive) {
  const preserved = existingRows.filter(
    (row) => row.stat_date < fromDate || row.stat_date >= endDateExclusive,
  );
  const merged = new Map();
  for (const row of [...preserved, ...incomingRows]) {
    merged.set(rowKey(row), row);
  }
  return [...merged.values()].sort((left, right) => {
    if (left.stat_date !== right.stat_date) {
      return left.stat_date.localeCompare(right.stat_date);
    }
    if (left.arena_id !== right.arena_id) {
      return String(left.arena_id).localeCompare(String(right.arena_id));
    }
    return left.config_rank - right.config_rank;
  });
}

export async function readSnapshot() {
  try {
    const raw = await fs.readFile(config.dataFile, 'utf8');
    const snapshot = JSON.parse(raw);
    if (!Array.isArray(snapshot.rows)) return null;
    if (snapshot.rows.length) {
      const dates = snapshot.rows.map((row) => row.stat_date).sort();
      snapshot.meta = {
        ...snapshot.meta,
        dataStartDate: dates[0],
        coverageEndExclusive: addDays(dates.at(-1), 1),
        rowCount: snapshot.rows.length,
      };
    }
    return snapshot;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeSnapshot(snapshot) {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true });
  const temporaryFile = `${config.dataFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(snapshot), 'utf8');
  await fs.rename(temporaryFile, config.dataFile);
}

async function refreshRangeFromDatabase(fromDate, endDateExclusive) {
  const incomingRows = await fetchDashboardRows(fromDate, endDateExclusive);
  const current = await readSnapshot();
  const rows = mergeRows(
    current?.rows || [],
    incomingRows,
    fromDate,
    endDateExclusive,
  );
  const snapshot = {
    version: 2,
    mode: 'live',
    rows,
    meta: {
      dataStartDate:
        current?.meta?.dataStartDate &&
        current.meta.dataStartDate < fromDate
          ? current.meta.dataStartDate
          : fromDate,
      coverageEndExclusive:
        current?.meta?.coverageEndExclusive &&
        current.meta.coverageEndExclusive > endDateExclusive
          ? current.meta.coverageEndExclusive
          : endDateExclusive,
      updatedAt: new Date().toISOString(),
      updatedAtShanghai: formatShanghaiDateTime(),
      refreshedRange: {
        start: fromDate,
        endExclusive: endDateExclusive,
      },
      rowCount: rows.length,
    },
  };
  await writeSnapshot(snapshot);
  return snapshot;
}

export function refreshDashboardRange(fromDate, endDateExclusive) {
  if (!activeRefresh) {
    activeRefresh = refreshRangeFromDatabase(fromDate, endDateExclusive).finally(
      () => {
        activeRefresh = undefined;
      },
    );
  }
  return activeRefresh;
}

export async function ensureSnapshotFresh() {
  if (!hasDatabaseConfig()) return null;
  if (!isDateString(config.dataStartDate)) {
    throw new Error(`DATA_START_DATE 格式无效：${config.dataStartDate}`);
  }

  const yesterday = yesterdayShanghai();
  const requiredEndExclusive = addDays(yesterday, 1);
  const current = await readSnapshot();
  const existingEnd = current?.meta?.coverageEndExclusive;

  if (
    current?.version === 2 &&
    current?.mode === 'live' &&
    current.meta?.dataStartDate <= config.dataStartDate &&
    existingEnd >= requiredEndExclusive
  ) {
    return current;
  }

  let refreshStart = config.dataStartDate;
  if (
    current?.version === 2 &&
    current?.mode === 'live' &&
    isDateString(current.meta?.dataStartDate) &&
    current.meta.dataStartDate <= config.dataStartDate &&
    isDateString(existingEnd) &&
    existingEnd <= requiredEndExclusive
  ) {
    refreshStart = existingEnd;
  }

  return refreshDashboardRange(refreshStart, requiredEndExclusive);
}

export async function refreshYesterday() {
  if (!hasDatabaseConfig()) {
    throw new Error('MySQL 环境变量尚未配置，无法刷新数据。');
  }
  const yesterday = yesterdayShanghai(new Date());
  const endExclusive = addDays(yesterday, 1);
  const wasMissingEarlierData = (await readSnapshot()) == null;
  const start = wasMissingEarlierData ? config.dataStartDate : yesterday;
  return refreshDashboardRange(start, endExclusive);
}

export function startDailyRefreshScheduler() {
  if (!hasDatabaseConfig()) {
    console.log(
      '[scheduler] MySQL 未配置，当前使用演示数据，不启动数据库刷新任务。',
    );
    return () => {};
  }

  let timer;
  let cancelled = false;

  const scheduleNext = () => {
    if (cancelled) return;
    const delay = millisecondsUntilNextRefresh(new Date(), config.refreshHour);
    const nextRun = new Date(Date.now() + delay);
    console.log(
      `[scheduler] 下一次自动刷新：${formatShanghaiDateTime(nextRun)}（Asia/Shanghai）`,
    );
    timer = setTimeout(async () => {
      try {
        console.log('[scheduler] 开始刷新前一交易日数据。');
        const snapshot = await refreshYesterday();
        console.log(
          `[scheduler] 刷新完成，共 ${snapshot.meta.rowCount} 行。`,
        );
      } catch (error) {
        console.error('[scheduler] 刷新失败：', error);
      } finally {
        scheduleNext();
      }
    }, delay);
    timer.unref?.();
  };

  scheduleNext();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export function getShanghaiTodayForRefresh() {
  return todayShanghai();
}
