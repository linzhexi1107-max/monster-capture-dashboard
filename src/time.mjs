const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const SHANGHAI_OFFSET_HOURS = 8;

function zhParts(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function formatShanghaiDate(date = new Date()) {
  const parts = zhParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function formatShanghaiDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = zhParts(date);
  return `${formatShanghaiDate(date)} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function addDays(dateString, amount) {
  if (!isDateString(dateString)) {
    throw new Error(`Invalid date: ${dateString}`);
  }
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function compareDateStrings(left, right) {
  return String(left).localeCompare(String(right));
}

export function todayShanghai(now = new Date()) {
  return formatShanghaiDate(now);
}

export function yesterdayShanghai(now = new Date()) {
  return addDays(todayShanghai(now), -1);
}

export function millisecondsUntilNextRefresh(now = new Date(), hour = 8) {
  const parts = zhParts(now);
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour - SHANGHAI_OFFSET_HOURS,
    0,
    0,
    0,
  );
  const current = now.getTime();
  return target > current
    ? target - current
    : target + 24 * 60 * 60 * 1000 - current;
}
