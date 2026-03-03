/**
 * Aggregates merged time blocks by calendar day (local time) and formats reports.
 */

/**
 * Formats a duration in seconds into a human-readable string.
 * - >= 1 hour: "Xh YYm"
 * - < 1 hour: "Xm YYs"
 *
 * @param {number} seconds - Total seconds to format
 * @returns {string}
 */
function formatDuration(seconds) {
  const totalSeconds = Math.round(seconds);

  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * Formats epoch-seconds as a local time string "HH:MM".
 *
 * @param {number} epochSeconds
 * @returns {string}
 */
function epochSecondsToLocalTimeString(epochSeconds) {
  const date = new Date(epochSeconds * 1000);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Converts an epoch-seconds timestamp to a 'YYYY-MM-DD' string in local time.
 *
 * @param {number} epochSeconds
 * @returns {string}
 */
function epochSecondsToLocalDateString(epochSeconds) {
  const date = new Date(epochSeconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the epoch-seconds timestamp of the next local midnight after the given Date.
 *
 * @param {Date} date
 * @returns {number} epoch seconds of the next midnight in local time
 */
function nextLocalMidnightSeconds(date) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0); // rolls over to midnight of the next day in local time
  return next.getTime() / 1000;
}

/**
 * Aggregates an array of merged time blocks by local calendar day.
 *
 * Each block that spans midnight is split at the midnight boundary so that
 * seconds are attributed to the correct day. Blocks spanning multiple
 * midnights are handled in a loop.
 *
 * @param {{ start: number, end: number }[]} mergedBlocks - Array of blocks with epoch-second timestamps
 * @returns {Map<string, number>} Map from 'YYYY-MM-DD' to total seconds for that day
 */
export function aggregateByDay(mergedBlocks) {
  const dailyTotals = new Map();

  for (const block of mergedBlocks) {
    let cursor = block.start;
    const blockEnd = block.end;

    while (cursor < blockEnd) {
      const cursorDate = new Date(cursor * 1000);
      const dateKey = epochSecondsToLocalDateString(cursor);
      const midnight = nextLocalMidnightSeconds(cursorDate);

      const segmentEnd = Math.min(midnight, blockEnd);
      const seconds = segmentEnd - cursor;

      const existing = dailyTotals.get(dateKey) ?? 0;
      dailyTotals.set(dateKey, existing + seconds);

      cursor = segmentEnd;
    }
  }

  return dailyTotals;
}

/**
 * Splits blocks by day, returning the actual block segments per day.
 *
 * @param {{ start: number, end: number }[]} mergedBlocks
 * @returns {Map<string, { start: number, end: number }[]>} Map from 'YYYY-MM-DD' to block segments
 */
export function blocksByDay(mergedBlocks) {
  const dayBlocks = new Map();

  for (const block of mergedBlocks) {
    let cursor = block.start;
    const blockEnd = block.end;

    while (cursor < blockEnd) {
      const cursorDate = new Date(cursor * 1000);
      const dateKey = epochSecondsToLocalDateString(cursor);
      const midnight = nextLocalMidnightSeconds(cursorDate);

      const segmentEnd = Math.min(midnight, blockEnd);

      if (!dayBlocks.has(dateKey)) {
        dayBlocks.set(dateKey, []);
      }
      dayBlocks.get(dateKey).push({ start: cursor, end: segmentEnd });

      cursor = segmentEnd;
    }
  }

  return dayBlocks;
}

/**
 * Formats a daily totals map into a human-readable work time report.
 *
 * @param {Map<string, number>} dailyTotals - Map from 'YYYY-MM-DD' to seconds
 * @param {{ dateRange: { from: number, to: number }, crossProjectOverlap: any }} config
 * @param {Map<string, { start: number, end: number }[]>} [dayBlocksMap] - Optional per-day block details
 * @returns {string}
 */
export function formatReport(dailyTotals, config, dayBlocksMap) {
  if (dailyTotals.size === 0) {
    return 'No activity found for the specified period.';
  }

  const fromDate = epochSecondsToLocalDateString(config.dateRange.from);
  const toDate = epochSecondsToLocalDateString(config.dateRange.to);

  const sortedDays = Array.from(dailyTotals.keys()).sort();

  const durations = sortedDays.map(day => formatDuration(dailyTotals.get(day)));

  let totalSeconds = 0;
  for (const seconds of dailyTotals.values()) {
    totalSeconds += seconds;
  }
  const totalFormatted = formatDuration(totalSeconds);

  const lines = [];
  lines.push('=== Claude Code Work Time Report ===');
  lines.push(`Period: ${fromDate} to ${toDate}`);
  lines.push('');

  for (let i = 0; i < sortedDays.length; i++) {
    const day = sortedDays[i];
    const duration = durations[i];
    lines.push(`  ${day}  ${duration}`);

    if (dayBlocksMap && dayBlocksMap.has(day)) {
      const blocks = dayBlocksMap.get(day);
      for (const block of blocks) {
        const startTime = epochSecondsToLocalTimeString(block.start);
        const endTime = epochSecondsToLocalTimeString(block.end);
        const blockDuration = formatDuration(block.end - block.start);
        lines.push(`    ${startTime} - ${endTime}  (${blockDuration})`);
      }
    }
  }

  lines.push('');

  const totalLabel = 'Total:';
  const dateColumnWidth = 10; // 'YYYY-MM-DD'
  const padding = dateColumnWidth - totalLabel.length;
  lines.push(`  ${totalLabel}${' '.repeat(padding)}  ${totalFormatted}`);

  lines.push('=================================');

  return lines.join('\n');
}
