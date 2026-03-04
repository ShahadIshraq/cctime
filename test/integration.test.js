import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../src/index.js';

// ---------------------------------------------------------------------------
// End-to-end integration test for the ccworktime `run()` function.
//
// Fixed date: 2026-01-15
//
// Session events (local clock times):
//   Cluster 1: 09:00, 09:05, 09:10  (gaps 300s each, within 600s threshold)
//   Large gap: 3000s between 09:10 and 09:00+50min = 09:50 actually
//             09:10 → 10:00 = 3000s  > 600s → new block
//   Cluster 2: 10:00, 10:05          (gap 300s, within threshold)
//
// Expected blocks after clustering with pauseThreshold=600:
//   Block 1: 09:00 → 09:10  (600s)
//   Block 2: 10:00 → 10:05  (300s)
//   Total: 900s = 15m
// ---------------------------------------------------------------------------

const TEST_DATE = '2026-01-15';
const PROJECT_PATH = '/Users/test/project';
const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Concrete local epoch-second timestamps for 2026-01-15
const t09_00 = Math.floor(new Date(2026, 0, 15, 9, 0, 0, 0).getTime() / 1000);
const t09_05 = Math.floor(new Date(2026, 0, 15, 9, 5, 0, 0).getTime() / 1000);
const t09_10 = Math.floor(new Date(2026, 0, 15, 9, 10, 0, 0).getTime() / 1000);
const t10_00 = Math.floor(new Date(2026, 0, 15, 10, 0, 0, 0).getTime() / 1000);
const t10_05 = Math.floor(new Date(2026, 0, 15, 10, 5, 0, 0).getTime() / 1000);

// The history.jsonl timestamp just needs to be on the target date
const historyTs = t09_00;

describe('integration: run()', () => {
  let tmpDir;

  before(() => {
    // -----------------------------------------------------------------------
    // Build the directory tree:
    //
    //   <tmpDir>/
    //     history.jsonl
    //     projects/
    //       -Users-test-project/
    //         a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl
    // -----------------------------------------------------------------------
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccworktime-integration-'));

    // projects/<encoded-project>/
    const encodedProject = PROJECT_PATH.replace(/\//g, '-');
    const projectDir = path.join(tmpDir, 'projects', encodedProject);
    fs.mkdirSync(projectDir, { recursive: true });

    // Session JSONL file — five events across two clusters
    const sessionLines = [
      JSON.stringify({ type: 'user', timestamp: t09_00 }),
      JSON.stringify({ type: 'assistant', timestamp: t09_05 }),
      JSON.stringify({ type: 'tool_result', timestamp: t09_10 }),
      JSON.stringify({ type: 'user', timestamp: t10_00 }),
      JSON.stringify({ type: 'assistant', timestamp: t10_05 }),
    ].join('\n');

    fs.writeFileSync(
      path.join(projectDir, `${SESSION_ID}.jsonl`),
      sessionLines,
      'utf8',
    );

    // history.jsonl — one entry pointing to our session
    const historyEntry = JSON.stringify({
      sessionId: SESSION_ID,
      project: PROJECT_PATH,
      timestamp: historyTs,
    });

    fs.writeFileSync(
      path.join(tmpDir, 'history.jsonl'),
      historyEntry,
      'utf8',
    );
  });

  after(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('produces a report containing the date, report header, and total', async () => {
    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(' '));

    try {
      await run([
        '--from', TEST_DATE,
        '--to', TEST_DATE,
        '--claude-dir', tmpDir,
      ]);
    } finally {
      console.log = originalLog;
    }

    const output = captured.join('\n');

    assert(
      output.includes(TEST_DATE),
      `Expected "${TEST_DATE}" in output:\n${output}`,
    );

    assert(
      output.includes('Work Time Report'),
      `Expected "Work Time Report" in output:\n${output}`,
    );

    assert(
      output.includes('Total:'),
      `Expected "Total:" in output:\n${output}`,
    );
  });

  it('reports 15 minutes of total work time (2 blocks: 10m + 5m)', async () => {
    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(' '));

    try {
      await run([
        '--from', TEST_DATE,
        '--to', TEST_DATE,
        '--claude-dir', tmpDir,
      ]);
    } finally {
      console.log = originalLog;
    }

    const output = captured.join('\n');

    // Block 1: t09_00 → t09_10 = 600s = 10m 00s
    // Block 2: t10_00 → t10_05 = 300s =  5m 00s
    // Total: 900s = 15m 00s
    assert(
      output.includes('15m 00s'),
      `Expected "15m 00s" in output (total):\n${output}`,
    );
  });

  it('outputs "No session files found" when no sessions match the date', async () => {
    const captured = [];
    const originalLog = console.log;
    console.log = (...args) => captured.push(args.join(' '));

    try {
      await run([
        '--from', '2020-01-01',
        '--to', '2020-01-01',
        '--claude-dir', tmpDir,
      ]);
    } finally {
      console.log = originalLog;
    }

    const output = captured.join('\n');

    assert(
      output.includes('No session files found') || output.includes('No activity'),
      `Expected no-activity message in output:\n${output}`,
    );
  });
});
