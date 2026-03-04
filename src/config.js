import os from 'os';
import path from 'path';

const DEFAULT_PAUSE_MINUTES = 10;
const DEFAULT_OVERLAP = 'merge';
const DEFAULT_CLAUDE_DIR = '~/.claude';

/**
 * Parse a YYYY-MM-DD string to epoch seconds at local midnight.
 * @param {string} dateStr
 * @returns {number} epoch seconds
 */
function parseDateToEpochStart(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid date "${dateStr}".`);
  }
  return Math.floor(date.getTime() / 1000);
}

/**
 * Parse a YYYY-MM-DD string to epoch seconds at end of day (23:59:59).
 * @param {string} dateStr
 * @returns {number} epoch seconds
 */
function parseDateToEpochEnd(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 23, 59, 59, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid date "${dateStr}".`);
  }
  return Math.floor(date.getTime() / 1000);
}

/**
 * Get today's date as a YYYY-MM-DD string in local time.
 * @returns {string}
 */
function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Return a YYYY-MM-DD string for today offset by daysOffset days.
 * @param {number} daysOffset - negative for past, positive for future
 * @returns {string}
 */
function dateOffsetString(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolve a path that may start with ~ to an absolute path.
 * @param {string} inputPath
 * @returns {string}
 */
function resolveHome(inputPath) {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}

/**
 * Parse CLI arguments into a config object.
 * @param {string[]} argv - process.argv.slice(2) or equivalent
 * @returns {{
 *   pauseThreshold: number,
 *   crossProjectOverlap: string,
 *   dateRange: { from: number, to: number },
 *   projectFilter: string[] | null,
 *   includeSubagents: boolean,
 *   claudeDir: string
 * }}
 */
const HELP_TEXT = `
Usage: ccworktime [options]

Calculate work time from Claude Code session logs.

Options:
  --from <YYYY-MM-DD>       Start date (default: today)
  --to <YYYY-MM-DD>         End date (default: today)
  --pause <minutes>         Inactivity threshold to split blocks (default: 10)
  --overlap merge|accumulate  Cross-project overlap handling (default: merge)
  --project <path>          Filter to project directory (repeatable)
  --no-subagents            Exclude Task tool (subagent) activity from time calculation
  --claude-dir <path>       Override ~/.claude directory
  --today                   Show today's work time (default)
  --yesterday               Show yesterday's work time
  --week                    Show current week (Monday to Sunday)
  --month                   Show current month
  --help, -h                Show this help message
  --version, -v             Show version number

Examples:
  ccworktime                              # Today's work time
  ccworktime --from 2026-02-01 --to 2026-02-28   # February totals
  ccworktime --project ~/workspace/myapp   # Single project
  ccworktime --pause 5                    # 5-min pause threshold`;

export function parseConfig(argv) {
  const today = todayString();

  let fromDate = today;
  let toDate = today;
  let pauseMinutes = DEFAULT_PAUSE_MINUTES;
  let overlap = DEFAULT_OVERLAP;
  let projects = [];
  let includeSubagents = true;
  let claudeDir = DEFAULT_CLAUDE_DIR;

  const args = Array.isArray(argv) ? argv : [];

  if (args.includes('--help') || args.includes('-h')) {
    throw new Error(`__HELP__${HELP_TEXT}`);
  }

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--from': {
        i++;
        if (i >= args.length) {
          throw new Error('--from requires a YYYY-MM-DD argument.');
        }
        fromDate = args[i];
        // Validate eagerly by attempting to parse.
        parseDateToEpochStart(fromDate);
        break;
      }

      case '--to': {
        i++;
        if (i >= args.length) {
          throw new Error('--to requires a YYYY-MM-DD argument.');
        }
        toDate = args[i];
        parseDateToEpochEnd(toDate);
        break;
      }

      case '--pause': {
        i++;
        if (i >= args.length) {
          throw new Error('--pause requires a numeric minutes argument.');
        }
        const raw = args[i];
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(
            `--pause value "${raw}" is not a valid non-negative number.`
          );
        }
        pauseMinutes = parsed;
        break;
      }

      case '--overlap': {
        i++;
        if (i >= args.length) {
          throw new Error('--overlap requires a value: merge or accumulate.');
        }
        const val = args[i];
        if (val !== 'merge' && val !== 'accumulate') {
          throw new Error(
            `--overlap value "${val}" is invalid. Expected "merge" or "accumulate".`
          );
        }
        overlap = val;
        break;
      }

      case '--project': {
        i++;
        if (i >= args.length) {
          throw new Error('--project requires a path argument.');
        }
        projects.push(resolveHome(args[i]));
        break;
      }

      case '--today': {
        fromDate = today;
        toDate = today;
        break;
      }

      case '--yesterday': {
        const yesterday = dateOffsetString(-1);
        fromDate = yesterday;
        toDate = yesterday;
        break;
      }

      case '--week': {
        const now = new Date();
        // getDay() returns 0=Sun..6=Sat; Monday is day 1
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const daysTosunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        fromDate = dateOffsetString(daysToMonday);
        toDate = dateOffsetString(daysTosunday);
        break;
      }

      case '--month': {
        const n = new Date();
        const year = n.getFullYear();
        const month = String(n.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
        fromDate = `${year}-${month}-01`;
        toDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
        break;
      }

      case '--no-subagents': {
        includeSubagents = false;
        break;
      }

      case '--claude-dir': {
        i++;
        if (i >= args.length) {
          throw new Error('--claude-dir requires a path argument.');
        }
        claudeDir = args[i];
        break;
      }

      default: {
        throw new Error(`Unknown option: "${arg}". Run ccworktime --help for usage.`);
      }
    }

    i++;
  }

  const fromEpoch = parseDateToEpochStart(fromDate);
  const toEpoch = parseDateToEpochEnd(toDate);

  if (fromEpoch > toEpoch) {
    throw new Error(`--from (${fromDate}) is after --to (${toDate}). Swap them?`);
  }

  return {
    pauseThreshold: pauseMinutes * 60,
    crossProjectOverlap: overlap,
    dateRange: {
      from: fromEpoch,
      to: toEpoch,
    },
    projectFilter: projects.length > 0 ? projects : null,
    includeSubagents,
    claudeDir: resolveHome(claudeDir),
  };
}
