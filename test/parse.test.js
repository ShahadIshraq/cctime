import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeTimestamp, parseSessionFile } from '../src/parse.js';

// ---------------------------------------------------------------------------
// normalizeTimestamp
// ---------------------------------------------------------------------------

describe('normalizeTimestamp', () => {
  it('converts an ISO date string to epoch seconds', () => {
    const iso = '2026-01-15T09:00:00.000Z';
    const expected = Math.floor(Date.parse(iso) / 1000);
    assert.equal(normalizeTimestamp(iso), expected);
  });

  it('converts epoch milliseconds (> 1e12) to epoch seconds by dividing by 1000', () => {
    const ms = 1_768_467_600_000; // > 1e12
    const expected = Math.floor(ms / 1000);
    assert.equal(normalizeTimestamp(ms), expected);
  });

  it('passes epoch seconds (<= 1e12) through unchanged (floored)', () => {
    const secs = 1_768_467_600; // <= 1e12
    assert.equal(normalizeTimestamp(secs), secs);
  });

  it('floors a fractional epoch-seconds number', () => {
    assert.equal(normalizeTimestamp(1000.9), 1000);
  });

  it('returns NaN for null', () => {
    assert(Number.isNaN(normalizeTimestamp(null)));
  });

  it('returns NaN for a plain object', () => {
    assert(Number.isNaN(normalizeTimestamp({})));
  });

  it('returns NaN for undefined', () => {
    assert(Number.isNaN(normalizeTimestamp(undefined)));
  });

  it('returns NaN for a boolean', () => {
    assert(Number.isNaN(normalizeTimestamp(true)));
  });
});

// ---------------------------------------------------------------------------
// parseSessionFile
// ---------------------------------------------------------------------------

// Concrete epoch-second values for 2026-01-15 in local time
const dayStart = Math.floor(new Date(2026, 0, 15, 0, 0, 0, 0).getTime() / 1000);
const dayEnd = Math.floor(new Date(2026, 0, 15, 23, 59, 59, 0).getTime() / 1000);

// Three event timestamps (epoch seconds, all within 2026-01-15 local day)
const ts1 = Math.floor(new Date(2026, 0, 15, 9, 0, 0, 0).getTime() / 1000);
const ts2 = Math.floor(new Date(2026, 0, 15, 9, 5, 0, 0).getTime() / 1000);
const ts3 = Math.floor(new Date(2026, 0, 15, 9, 10, 0, 0).getTime() / 1000);

/** Config covering the whole of 2026-01-15 locally, including subagents. */
const baseConfig = {
  dateRange: { from: dayStart, to: dayEnd },
  includeSubagents: true,
};

describe('parseSessionFile', () => {
  it('parses a JSONL file and returns sorted events', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-parse-test-'));

    try {
      const filePath = path.join(tmpDir, 'session.jsonl');

      // Write three events in reverse order to prove sorting
      const lines = [
        JSON.stringify({ type: 'assistant', timestamp: ts3 }),
        JSON.stringify({ type: 'user', timestamp: ts1 }),
        JSON.stringify({ type: 'tool_result', timestamp: ts2 }),
        '', // blank line — should be skipped silently
      ].join('\n');

      fs.writeFileSync(filePath, lines, 'utf8');

      const result = await parseSessionFile(
        { filePath, project: '/test/project', sessionId: 'test-session', isSubagent: false },
        baseConfig,
      );

      assert(result !== null, 'Expected a non-null result');
      assert.equal(result.project, '/test/project');
      assert.equal(result.sessionId, 'test-session');
      assert.equal(result.isSubagent, false);
      assert.equal(result.events.length, 3);

      // Events must be sorted ascending
      assert.equal(result.events[0].ts, ts1);
      assert.equal(result.events[1].ts, ts2);
      assert.equal(result.events[2].ts, ts3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('filters out events outside the config date range', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-parse-test-'));

    try {
      const filePath = path.join(tmpDir, 'session.jsonl');

      // One event in range, one far outside (year 2025)
      const tsOutside = Math.floor(new Date(2025, 0, 1, 12, 0, 0, 0).getTime() / 1000);
      const lines = [
        JSON.stringify({ type: 'user', timestamp: ts1 }),
        JSON.stringify({ type: 'assistant', timestamp: tsOutside }),
      ].join('\n');

      fs.writeFileSync(filePath, lines, 'utf8');

      const result = await parseSessionFile(
        { filePath, project: '/test/project', sessionId: 'test-session', isSubagent: false },
        baseConfig,
      );

      assert(result !== null);
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].ts, ts1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips events with unrecognised types', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-parse-test-'));

    try {
      const filePath = path.join(tmpDir, 'session.jsonl');
      const lines = [
        JSON.stringify({ type: 'system', timestamp: ts1 }),       // not in VALID_TYPES
        JSON.stringify({ type: 'unknown', timestamp: ts2 }),      // not in VALID_TYPES
        JSON.stringify({ type: 'user', timestamp: ts3 }),         // valid
      ].join('\n');

      fs.writeFileSync(filePath, lines, 'utf8');

      const result = await parseSessionFile(
        { filePath, project: '/p', sessionId: 's', isSubagent: false },
        baseConfig,
      );

      assert(result !== null);
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].ts, ts3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null for a subagent file when includeSubagents is false', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-parse-test-'));

    try {
      const filePath = path.join(tmpDir, 'agent-session.jsonl');
      fs.writeFileSync(
        filePath,
        JSON.stringify({ type: 'user', timestamp: ts1 }),
        'utf8',
      );

      const configNoSubagents = { ...baseConfig, includeSubagents: false };

      const result = await parseSessionFile(
        { filePath, project: '/p', sessionId: 'agent-session', isSubagent: true },
        configNoSubagents,
      );

      assert.equal(result, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null for a missing file (ENOENT)', async () => {
    const result = await parseSessionFile(
      {
        filePath: '/nonexistent/path/that/does/not/exist/session.jsonl',
        project: '/p',
        sessionId: 's',
        isSubagent: false,
      },
      baseConfig,
    );

    assert.equal(result, null);
  });

  it('returns null when the file contains no events in the date range', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-parse-test-'));

    try {
      const filePath = path.join(tmpDir, 'empty-range.jsonl');
      // All events are outside the date range
      const tsOutside = Math.floor(new Date(2020, 0, 1, 0, 0, 0, 0).getTime() / 1000);
      fs.writeFileSync(
        filePath,
        JSON.stringify({ type: 'user', timestamp: tsOutside }),
        'utf8',
      );

      const result = await parseSessionFile(
        { filePath, project: '/p', sessionId: 's', isSubagent: false },
        baseConfig,
      );

      assert.equal(result, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('normalises epoch-millisecond timestamps found in files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-parse-test-'));

    try {
      const filePath = path.join(tmpDir, 'ms.jsonl');
      // ts1 as milliseconds (> 1e12)
      const tsMs = ts1 * 1000;
      fs.writeFileSync(
        filePath,
        JSON.stringify({ type: 'user', timestamp: tsMs }),
        'utf8',
      );

      const result = await parseSessionFile(
        { filePath, project: '/p', sessionId: 's', isSubagent: false },
        baseConfig,
      );

      assert(result !== null);
      assert.equal(result.events[0].ts, ts1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
