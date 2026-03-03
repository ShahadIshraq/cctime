import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { clusterIntoBlocks } from '../src/cluster.js';

// ---------------------------------------------------------------------------
// clusterIntoBlocks(events, pauseThreshold)
//
// Events must be sorted ascending by `ts` (epoch seconds).
// A new block is started when the gap between consecutive events is
// STRICTLY GREATER THAN pauseThreshold (not >= ).
// ---------------------------------------------------------------------------

describe('clusterIntoBlocks', () => {
  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  it('returns empty array for empty events', () => {
    const result = clusterIntoBlocks([], 600);
    assert.deepEqual(result, []);
  });

  it('returns a single block for a single event', () => {
    const events = [{ ts: 1000 }];
    const result = clusterIntoBlocks(events, 600);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 1000);
    assert.equal(result[0].end, 1000);
  });

  // -------------------------------------------------------------------------
  // Within threshold — all events collapse to one block
  // -------------------------------------------------------------------------
  it('merges events whose gaps are all within the threshold into a single block', () => {
    // gaps: 300, 299 — both <= 600
    const events = [{ ts: 1000 }, { ts: 1300 }, { ts: 1599 }];
    const result = clusterIntoBlocks(events, 600);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 1000);
    assert.equal(result[0].end, 1599);
  });

  // -------------------------------------------------------------------------
  // Boundary: gap exactly equal to threshold => still one block (<= allowed)
  // The condition is gap > threshold, so gap === threshold does NOT split.
  // -------------------------------------------------------------------------
  it('keeps events in one block when the gap is exactly equal to the threshold', () => {
    const threshold = 600;
    // gap = 600, which is NOT greater than threshold → stays in same block
    const events = [{ ts: 1000 }, { ts: 1600 }];
    const result = clusterIntoBlocks(events, threshold);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 1000);
    assert.equal(result[0].end, 1600);
  });

  // -------------------------------------------------------------------------
  // Gap exceeds threshold → two blocks
  // -------------------------------------------------------------------------
  it('splits into two blocks when the gap exceeds the threshold', () => {
    const threshold = 600;
    // gap = 601, which IS greater than threshold → split
    const events = [{ ts: 1000 }, { ts: 1601 }];
    const result = clusterIntoBlocks(events, threshold);

    assert.equal(result.length, 2);
    assert.equal(result[0].start, 1000);
    assert.equal(result[0].end, 1000);
    assert.equal(result[1].start, 1601);
    assert.equal(result[1].end, 1601);
  });

  // -------------------------------------------------------------------------
  // Multiple gaps — correct block count
  // -------------------------------------------------------------------------
  it('produces the correct number of blocks for multiple gaps', () => {
    const threshold = 600;

    // Events with 3 distinct clusters separated by gaps > 600s:
    //   Cluster 1: 1000, 1200, 1400  (gaps 200, 200 — within threshold)
    //   gap 1000s between 1400 and 2400
    //   Cluster 2: 2400, 2500         (gap 100 — within threshold)
    //   gap 800s between 2500 and 3300
    //   Cluster 3: 3300
    const events = [
      { ts: 1000 },
      { ts: 1200 },
      { ts: 1400 },
      { ts: 2400 }, // gap 1000 > 600 → new block
      { ts: 2500 },
      { ts: 3300 }, // gap 800 > 600 → new block
    ];

    const result = clusterIntoBlocks(events, threshold);

    assert.equal(result.length, 3);

    assert.equal(result[0].start, 1000);
    assert.equal(result[0].end, 1400);

    assert.equal(result[1].start, 2400);
    assert.equal(result[1].end, 2500);

    assert.equal(result[2].start, 3300);
    assert.equal(result[2].end, 3300);
  });

  // -------------------------------------------------------------------------
  // Threshold of 0 — any two distinct timestamps become separate blocks
  // -------------------------------------------------------------------------
  it('splits every consecutive pair into its own block when threshold is 0', () => {
    const events = [{ ts: 1 }, { ts: 2 }, { ts: 3 }];
    // gap=1 > 0, gap=1 > 0 → 3 blocks
    const result = clusterIntoBlocks(events, 0);

    assert.equal(result.length, 3);
  });
});
