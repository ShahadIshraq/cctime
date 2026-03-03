import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aggregateByDay, blocksByDay, formatReport } from '../src/aggregate.js';

// ---------------------------------------------------------------------------
// Concrete epoch-second timestamps used throughout these tests.
//
// All times are local clock times expressed via new Date(year, month-1, day, h, m, s).
// Using local time avoids any timezone-dependent failures.
//
// 2026-01-15 09:00 local  →  t1
// 2026-01-15 11:00 local  →  t2
// 2026-01-15 23:30 local  →  tLate  (just before midnight)
// 2026-01-16 00:30 local  →  tEarly (just after midnight)
// ---------------------------------------------------------------------------
const t1 = Math.floor(new Date(2026, 0, 15, 9, 0, 0, 0).getTime() / 1000);
const t2 = Math.floor(new Date(2026, 0, 15, 11, 0, 0, 0).getTime() / 1000);
const tLate = Math.floor(new Date(2026, 0, 15, 23, 30, 0, 0).getTime() / 1000);
const tEarly = Math.floor(new Date(2026, 0, 16, 0, 30, 0, 0).getTime() / 1000);
const tMidnight = Math.floor(new Date(2026, 0, 16, 0, 0, 0, 0).getTime() / 1000);

// ---------------------------------------------------------------------------
// aggregateByDay
// ---------------------------------------------------------------------------

describe('aggregateByDay', () => {
  it('returns an empty Map for an empty block array', () => {
    const result = aggregateByDay([]);
    assert(result instanceof Map);
    assert.equal(result.size, 0);
  });

  it('accumulates a single block entirely within one day', () => {
    // Block from 09:00 to 11:00 local on 2026-01-15 = 7200 seconds
    const result = aggregateByDay([{ start: t1, end: t2 }]);

    assert.equal(result.size, 1);
    assert(result.has('2026-01-15'));
    assert.equal(result.get('2026-01-15'), t2 - t1); // 7200
  });

  it('splits a midnight-spanning block across the two days', () => {
    // tLate = 23:30 on Jan 15, tEarly = 00:30 on Jan 16
    // Jan 15 contribution: tMidnight - tLate = 1800 s
    // Jan 16 contribution: tEarly - tMidnight = 1800 s
    const result = aggregateByDay([{ start: tLate, end: tEarly }]);

    assert.equal(result.size, 2);
    assert(result.has('2026-01-15'), '2026-01-15 must be present');
    assert(result.has('2026-01-16'), '2026-01-16 must be present');

    assert.equal(result.get('2026-01-15'), tMidnight - tLate); // 1800
    assert.equal(result.get('2026-01-16'), tEarly - tMidnight); // 1800
  });

  it('accumulates seconds from multiple blocks on the same day', () => {
    // Two separate 1-hour blocks on 2026-01-15
    const block1 = { start: t1, end: t1 + 3600 };
    const block2 = { start: t2, end: t2 + 3600 };

    const result = aggregateByDay([block1, block2]);

    assert.equal(result.size, 1);
    assert.equal(result.get('2026-01-15'), 7200);
  });
});

// ---------------------------------------------------------------------------
// blocksByDay
// ---------------------------------------------------------------------------

describe('blocksByDay', () => {
  it('returns an empty Map for an empty block array', () => {
    const result = blocksByDay([]);
    assert(result instanceof Map);
    assert.equal(result.size, 0);
  });

  it('returns block segments for a single-day block', () => {
    const result = blocksByDay([{ start: t1, end: t2 }]);

    assert(result.has('2026-01-15'));
    const segments = result.get('2026-01-15');
    assert.equal(segments.length, 1);
    assert.equal(segments[0].start, t1);
    assert.equal(segments[0].end, t2);
  });

  it('splits a midnight-spanning block into two day segments', () => {
    const result = blocksByDay([{ start: tLate, end: tEarly }]);

    assert.equal(result.size, 2);

    const jan15 = result.get('2026-01-15');
    assert.equal(jan15.length, 1);
    assert.equal(jan15[0].start, tLate);
    assert.equal(jan15[0].end, tMidnight);

    const jan16 = result.get('2026-01-16');
    assert.equal(jan16.length, 1);
    assert.equal(jan16[0].start, tMidnight);
    assert.equal(jan16[0].end, tEarly);
  });

  it('places multiple blocks on the same day into the same array', () => {
    const block1 = { start: t1, end: t1 + 3600 };
    const block2 = { start: t2, end: t2 + 1800 };

    const result = blocksByDay([block1, block2]);

    assert(result.has('2026-01-15'));
    const segments = result.get('2026-01-15');
    assert.equal(segments.length, 2);
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe('formatReport', () => {
  // Minimal config object required by formatReport
  const config = {
    dateRange: {
      from: Math.floor(new Date(2026, 0, 15, 0, 0, 0, 0).getTime() / 1000),
      to: Math.floor(new Date(2026, 0, 15, 23, 59, 59, 0).getTime() / 1000),
    },
    crossProjectOverlap: 'merge',
  };

  it('returns the no-activity message for an empty Map', () => {
    const result = formatReport(new Map(), config);
    assert.equal(result, 'No activity found for the specified period.');
  });

  it('contains the date key and total line for a populated Map', () => {
    const dailyTotals = new Map([['2026-01-15', 7200]]); // 2 hours
    const result = formatReport(dailyTotals, config);

    // Should mention the day
    assert(
      result.includes('2026-01-15'),
      `Expected "2026-01-15" in output:\n${result}`,
    );

    // Should contain a "Total:" line
    assert(
      result.includes('Total:'),
      `Expected "Total:" in output:\n${result}`,
    );

    // Should mention the report header
    assert(
      result.includes('Work Time Report'),
      `Expected "Work Time Report" in output:\n${result}`,
    );
  });

  it('formats a 2-hour total as "2h 00m"', () => {
    const dailyTotals = new Map([['2026-01-15', 7200]]);
    const result = formatReport(dailyTotals, config);

    assert(
      result.includes('2h 00m'),
      `Expected "2h 00m" in output:\n${result}`,
    );
  });

  it('formats a sub-hour total correctly (minutes and seconds)', () => {
    const dailyTotals = new Map([['2026-01-15', 90]]); // 1m 30s
    const result = formatReport(dailyTotals, config);

    assert(
      result.includes('1m 30s'),
      `Expected "1m 30s" in output:\n${result}`,
    );
  });

  it('reports the period from/to dates', () => {
    const dailyTotals = new Map([['2026-01-15', 3600]]);
    const result = formatReport(dailyTotals, config);

    assert(
      result.includes('2026-01-15'),
      `Expected period date "2026-01-15" in output:\n${result}`,
    );
  });

  it('includes per-block time ranges when dayBlocksMap is provided', () => {
    const dailyTotals = new Map([['2026-01-15', t2 - t1]]);
    const dayBlocksMap = new Map([
      ['2026-01-15', [{ start: t1, end: t2 }]],
    ]);
    const result = formatReport(dailyTotals, config, dayBlocksMap);

    // The block's start and end times must appear somewhere in the report
    // (formatted as HH:MM)
    const startHour = String(new Date(t1 * 1000).getHours()).padStart(2, '0');
    assert(
      result.includes(startHour),
      `Expected start hour "${startHour}" in output:\n${result}`,
    );
  });
});
