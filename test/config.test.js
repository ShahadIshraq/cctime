import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return today's YYYY-MM-DD string in local time, matching the logic inside
 * config.js so our assertions stay correct regardless of when tests run.
 */
function localDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Epoch seconds at local midnight for a YYYY-MM-DD string. */
function epochStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
}

/** Epoch seconds at local 23:59:59 for a YYYY-MM-DD string. */
function epochEnd(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 23, 59, 59, 0).getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseConfig', () => {
  // -------------------------------------------------------------------------
  // Default values (no args)
  // -------------------------------------------------------------------------
  it('returns correct defaults when no arguments are passed', () => {
    const cfg = parseConfig([]);
    const today = localDateString();

    assert.equal(cfg.pauseThreshold, 600);
    assert.equal(cfg.crossProjectOverlap, 'merge');
    assert.equal(cfg.projectFilter, null);
    assert.equal(cfg.includeSubagents, true);
    assert.equal(cfg.dateRange.from, epochStart(today));
    assert.equal(cfg.dateRange.to, epochEnd(today));
  });

  // -------------------------------------------------------------------------
  // --from / --to
  // -------------------------------------------------------------------------
  it('parses --from and --to dates correctly', () => {
    const cfg = parseConfig(['--from', '2026-01-15', '--to', '2026-01-20']);

    assert.equal(cfg.dateRange.from, epochStart('2026-01-15'));
    assert.equal(cfg.dateRange.to, epochEnd('2026-01-20'));
  });

  // -------------------------------------------------------------------------
  // --pause
  // -------------------------------------------------------------------------
  it('converts --pause minutes to seconds for pauseThreshold', () => {
    const cfg = parseConfig(['--pause', '5']);

    assert.equal(cfg.pauseThreshold, 300);
  });

  // -------------------------------------------------------------------------
  // --overlap
  // -------------------------------------------------------------------------
  it('sets crossProjectOverlap to accumulate with --overlap accumulate', () => {
    const cfg = parseConfig(['--overlap', 'accumulate']);

    assert.equal(cfg.crossProjectOverlap, 'accumulate');
  });

  // -------------------------------------------------------------------------
  // --project (repeatable)
  // -------------------------------------------------------------------------
  it('collects multiple --project values into projectFilter array', () => {
    const cfg = parseConfig(['--project', '/foo', '--project', '/bar']);

    assert.deepEqual(cfg.projectFilter, ['/foo', '/bar']);
  });

  // -------------------------------------------------------------------------
  // --no-subagents
  // -------------------------------------------------------------------------
  it('sets includeSubagents to false with --no-subagents', () => {
    const cfg = parseConfig(['--no-subagents']);

    assert.equal(cfg.includeSubagents, false);
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------
  it('throws on invalid --from date format', () => {
    assert.throws(
      () => parseConfig(['--from', 'abc']),
      (err) => {
        assert(err instanceof Error);
        assert(
          err.message.includes('Invalid date format'),
          `Expected "Invalid date format" in: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('throws when --from is after --to', () => {
    assert.throws(
      () => parseConfig(['--from', '2026-03-05', '--to', '2026-03-01']),
      (err) => {
        assert(err instanceof Error);
        // Message must mention both dates so the user can act on it
        assert(err.message.includes('2026-03-05'), err.message);
        assert(err.message.includes('2026-03-01'), err.message);
        return true;
      },
    );
  });

  it('throws on unknown flag', () => {
    assert.throws(
      () => parseConfig(['--foo']),
      (err) => {
        assert(err instanceof Error);
        assert(
          err.message.includes('--foo'),
          `Expected "--foo" in: ${err.message}`,
        );
        return true;
      },
    );
  });

  // -------------------------------------------------------------------------
  // Help flags
  // -------------------------------------------------------------------------
  it('throws with __HELP__ prefix for --help', () => {
    assert.throws(
      () => parseConfig(['--help']),
      (err) => {
        assert(err instanceof Error);
        assert(
          err.message.startsWith('__HELP__'),
          `Expected message to start with __HELP__, got: ${err.message.slice(0, 40)}`,
        );
        return true;
      },
    );
  });

  it('throws with __HELP__ prefix for -h', () => {
    assert.throws(
      () => parseConfig(['-h']),
      (err) => {
        assert(err instanceof Error);
        assert(
          err.message.startsWith('__HELP__'),
          `Expected message to start with __HELP__, got: ${err.message.slice(0, 40)}`,
        );
        return true;
      },
    );
  });

  // -------------------------------------------------------------------------
  // Date shortcut flags
  // -------------------------------------------------------------------------
  it('--yesterday sets both from and to to yesterday', () => {
    const cfg = parseConfig(['--yesterday']);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = localDateString(yesterday);

    assert.equal(cfg.dateRange.from, epochStart(yStr));
    assert.equal(cfg.dateRange.to, epochEnd(yStr));
  });

  it('--week sets from to Monday and to to Sunday of the current week', () => {
    const cfg = parseConfig(['--week']);

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun…6=Sat
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

    const monday = new Date();
    monday.setDate(monday.getDate() + daysToMonday);
    const sunday = new Date();
    sunday.setDate(sunday.getDate() + daysToSunday);

    assert.equal(cfg.dateRange.from, epochStart(localDateString(monday)));
    assert.equal(cfg.dateRange.to, epochEnd(localDateString(sunday)));
  });

  it('--month sets from to the 1st and to to the last day of the current month', () => {
    const cfg = parseConfig(['--month']);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const firstStr = `${year}-${month}-01`;
    const lastStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    assert.equal(cfg.dateRange.from, epochStart(firstStr));
    assert.equal(cfg.dateRange.to, epochEnd(lastStr));
  });
});
