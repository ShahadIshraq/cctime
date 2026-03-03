/**
 * Clusters a sorted array of timestamped events into contiguous blocks,
 * splitting whenever the gap between consecutive events exceeds pauseThreshold.
 *
 * @param {Array<{ ts: number }>} events - Events sorted ascending by ts (epoch seconds)
 * @param {number} pauseThreshold - Gap in seconds above which a new block is started
 * @returns {Array<{ start: number, end: number }>} Blocks of contiguous activity
 */
export function clusterIntoBlocks(events, pauseThreshold) {
  if (events.length === 0) {
    return [];
  }

  const blocks = [];
  let blockStart = events[0].ts;
  let lastTs = events[0].ts;

  for (let i = 1; i < events.length; i++) {
    const event = events[i];

    if (event.ts - lastTs > pauseThreshold) {
      blocks.push({ start: blockStart, end: lastTs });
      blockStart = event.ts;
    }

    lastTs = event.ts;
  }

  blocks.push({ start: blockStart, end: lastTs });

  return blocks;
}
