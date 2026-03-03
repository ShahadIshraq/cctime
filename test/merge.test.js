import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mergeIntervals } from '../src/merge.js';

// ---------------------------------------------------------------------------
// mergeIntervals(intervals)
//
// Merges overlapping or adjacent intervals (start <= end of previous).
// Returns a new sorted array; the original is not mutated.
// ---------------------------------------------------------------------------

describe('mergeIntervals', () => {
  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  it('returns an empty array for empty input', () => {
    assert.deepEqual(mergeIntervals([]), []);
  });

  it('returns the same single interval unchanged', () => {
    const input = [{ start: 100, end: 200 }];
    const result = mergeIntervals(input);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 200);
  });

  // -------------------------------------------------------------------------
  // Two non-overlapping intervals
  // -------------------------------------------------------------------------
  it('keeps two non-overlapping intervals separate', () => {
    // gap of 1 second between them: end=200, next start=201
    const result = mergeIntervals([
      { start: 100, end: 200 },
      { start: 201, end: 300 },
    ]);

    assert.equal(result.length, 2);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 200);
    assert.equal(result[1].start, 201);
    assert.equal(result[1].end, 300);
  });

  // -------------------------------------------------------------------------
  // Two overlapping intervals
  // -------------------------------------------------------------------------
  it('merges two overlapping intervals into one', () => {
    const result = mergeIntervals([
      { start: 100, end: 250 },
      { start: 200, end: 350 },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 350);
  });

  // -------------------------------------------------------------------------
  // Adjacent intervals (end === start) — should be merged
  // The condition is interval.start <= last.end, so equal endpoints merge.
  // -------------------------------------------------------------------------
  it('merges adjacent intervals where end equals start of next', () => {
    const result = mergeIntervals([
      { start: 100, end: 200 },
      { start: 200, end: 300 },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 300);
  });

  // -------------------------------------------------------------------------
  // Fully contained interval
  // -------------------------------------------------------------------------
  it('absorbs a fully contained interval into the outer interval', () => {
    const result = mergeIntervals([
      { start: 100, end: 500 },
      { start: 200, end: 300 }, // fully inside first
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 500);
  });

  // -------------------------------------------------------------------------
  // Multiple overlapping intervals
  // -------------------------------------------------------------------------
  it('correctly merges a chain of multiple overlapping intervals', () => {
    const result = mergeIntervals([
      { start: 100, end: 200 },
      { start: 150, end: 300 },
      { start: 250, end: 400 },
      { start: 500, end: 600 }, // non-overlapping with the chain
    ]);

    assert.equal(result.length, 2);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 400);
    assert.equal(result[1].start, 500);
    assert.equal(result[1].end, 600);
  });

  // -------------------------------------------------------------------------
  // Input array is not mutated
  // -------------------------------------------------------------------------
  it('does not mutate the original input array', () => {
    const input = [
      { start: 200, end: 400 },
      { start: 100, end: 300 },
    ];
    // Take a snapshot of the original order and values
    const originalFirst = { ...input[0] };
    const originalSecond = { ...input[1] };

    mergeIntervals(input);

    // Array order must not have changed
    assert.equal(input.length, 2);
    assert.deepEqual(input[0], originalFirst);
    assert.deepEqual(input[1], originalSecond);
  });

  // -------------------------------------------------------------------------
  // Unsorted input — the function must sort internally and still merge
  // -------------------------------------------------------------------------
  it('handles unsorted input by sorting before merging', () => {
    const result = mergeIntervals([
      { start: 300, end: 400 },
      { start: 100, end: 250 },
      { start: 200, end: 350 },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].start, 100);
    assert.equal(result[0].end, 400);
  });
});
