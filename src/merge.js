/**
 * Merges overlapping or adjacent intervals.
 *
 * @param {Array<{ start: number, end: number }>} intervals - Array of intervals with epoch seconds
 * @returns {Array<{ start: number, end: number }>} Merged intervals sorted by start
 */
export function mergeIntervals(intervals) {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((a, b) => a.start - b.start);

  const result = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const interval = sorted[i];
    const last = result[result.length - 1];

    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      result.push({ ...interval });
    }
  }

  return result;
}
