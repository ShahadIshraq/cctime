import pc from 'picocolors';
import Table from 'cli-table3';
import { formatDuration, epochSecondsToLocalTimeString, epochSecondsToLocalDateString } from './aggregate.js';

/**
 * Formats a daily totals map into a pretty-printed work time report with colors and box-drawing.
 *
 * @param {Map<string, number>} dailyTotals - Map from 'YYYY-MM-DD' to seconds
 * @param {{ dateRange: { from: number, to: number } }} config
 * @param {Map<string, { start: number, end: number }[]>} [dayBlocksMap]
 * @returns {string}
 */
export function formatReportPretty(dailyTotals, config, dayBlocksMap) {
  if (dailyTotals.size === 0) {
    return pc.yellow('No activity found for the specified period.');
  }

  const fromDate = epochSecondsToLocalDateString(config.dateRange.from);
  const toDate = epochSecondsToLocalDateString(config.dateRange.to);

  // Build header box
  const boxWidth = 45;
  const title = pc.cyan(pc.bold('Claude Code Work Time Report'));
  const period = `Period: ${fromDate} to ${toDate}`;
  const titlePad = boxWidth - 'Claude Code Work Time Report'.length - 4;
  const periodPad = boxWidth - period.length - 4;

  const header = [
    `╭${'─'.repeat(boxWidth)}╮`,
    `│   ${title}${' '.repeat(Math.max(0, titlePad))} │`,
    `│   ${period}${' '.repeat(Math.max(0, periodPad))} │`,
    `╰${'─'.repeat(boxWidth)}╯`,
  ].join('\n');

  // Build table
  const table = new Table({
    head: [pc.bold('Date'), pc.bold('Duration'), pc.bold('Work Blocks')],
    colWidths: [14, 12, 35],
    style: { head: [], border: [] },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    }
  });

  const sortedDays = Array.from(dailyTotals.keys()).sort();

  let totalSeconds = 0;
  let totalBlockCount = 0;

  for (const day of sortedDays) {
    const seconds = dailyTotals.get(day);
    totalSeconds += seconds;

    const blocks = dayBlocksMap?.get(day);
    if (blocks) totalBlockCount += blocks.length;

    let blocksStr = '';
    if (blocks && blocks.length > 0) {
      blocksStr = blocks.map(block => {
        const startTime = epochSecondsToLocalTimeString(block.start);
        const endTime = epochSecondsToLocalTimeString(block.end);
        const dur = formatDuration(block.end - block.start);
        return pc.dim(`${startTime} - ${endTime}  (${dur})`);
      }).join('\n');
    }

    table.push([
      pc.white(day),
      pc.green(formatDuration(seconds)),
      blocksStr
    ]);
  }

  // Total row
  table.push([
    pc.yellow(pc.bold('Total')),
    pc.yellow(pc.bold(formatDuration(totalSeconds))),
    pc.dim(`${totalBlockCount} blocks across ${dailyTotals.size} days`)
  ]);

  return header + '\n\n' + table.toString();
}
