import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  isDateString,
  millisecondsUntilNextRefresh,
} from '../src/time.mjs';

test('validates real calendar dates', () => {
  assert.equal(isDateString('2026-10-01'), true);
  assert.equal(isDateString('2026-02-29'), false);
  assert.equal(isDateString('2026-13-01'), false);
  assert.equal(isDateString('10/01/2026'), false);
});

test('adds days across month boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('calculates the next 08:00 Asia/Shanghai refresh', () => {
  const beforeRefresh = new Date('2026-11-09T23:30:00.000Z');
  assert.equal(
    millisecondsUntilNextRefresh(beforeRefresh, 8),
    30 * 60 * 1000,
  );

  const afterRefresh = new Date('2026-11-10T00:00:01.000Z');
  assert.equal(
    millisecondsUntilNextRefresh(afterRefresh, 8),
    24 * 60 * 60 * 1000 - 1000,
  );
});
