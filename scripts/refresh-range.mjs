import { closeDatabase } from '../src/query.mjs';
import { refreshDashboardRange } from '../src/refresh.mjs';
import { addDays, isDateString } from '../src/time.mjs';

const startDate = process.argv[2];
const endDate = process.argv[3];

if (!isDateString(startDate) || !isDateString(endDate) || startDate > endDate) {
  console.error('Usage: node scripts/refresh-range.mjs YYYY-MM-DD YYYY-MM-DD');
  process.exit(1);
}

const startedAt = Date.now();
try {
  const snapshot = await refreshDashboardRange(startDate, addDays(endDate, 1));
  const durationMs = Date.now() - startedAt;
  console.log(
    `Range refresh succeeded: ${startDate}..${endDate}, ${snapshot.meta.rowCount} rows, ${durationMs} ms.`,
  );
} catch (error) {
  console.error(`Range refresh failed: ${error.code || 'UNKNOWN'} - ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
