import { closeDatabase } from '../src/query.mjs';
import { ensureSnapshotFresh } from '../src/refresh.mjs';

try {
  const snapshot = await ensureSnapshotFresh();
  if (!snapshot) {
    console.error('MySQL 环境变量未配置，无法刷新。');
    process.exitCode = 1;
  } else {
    console.log(
      `刷新完成：${snapshot.meta.rowCount} 行，覆盖至 ${snapshot.meta.coverageEndExclusive}（不含）。`,
    );
  }
} catch (error) {
  console.error('刷新失败：', error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
