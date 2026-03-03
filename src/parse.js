import fs from 'fs';
import readline from 'readline';

/**
 * Normalize a raw timestamp value to epoch seconds.
 *
 * @param {string|number|*} raw
 * @returns {number} epoch seconds, or NaN if the input is unrecognisable
 */
export function normalizeTimestamp(raw) {
  if (typeof raw === 'string') {
    return Math.floor(Date.parse(raw) / 1000);
  }

  if (typeof raw === 'number') {
    // Milliseconds when the value is clearly too large to be epoch-seconds
    if (raw > 1e12) {
      return Math.floor(raw / 1000);
    }
    return Math.floor(raw);
  }

  return NaN;
}

/**
 * Extract a raw timestamp from a parsed JSONL object.
 * Checks the top-level `timestamp` field first, then falls back to common
 * nested locations used in Claude Code session files.
 *
 * @param {object} obj
 * @returns {string|number|undefined}
 */
function extractRawTimestamp(obj) {
  // Top-level field takes priority
  if (obj.timestamp !== undefined) {
    return obj.timestamp;
  }

  // Common nested locations observed in Claude session JSONL files
  if (obj.message?.timestamp !== undefined) {
    return obj.message.timestamp;
  }

  if (obj.content?.timestamp !== undefined) {
    return obj.content.timestamp;
  }

  if (obj.data?.timestamp !== undefined) {
    return obj.data.timestamp;
  }

  return undefined;
}

/**
 * Parse a single JSONL session file and return filtered, sorted events.
 *
 * @param {{ filePath: string, project: string, sessionId: string, isSubagent: boolean }} fileInfo
 * @param {{ dateRange: { from: number, to: number }, includeSubagents: boolean }} config
 * @returns {Promise<{ project: string, sessionId: string, isSubagent: boolean, events: { ts: number }[] } | null>}
 */
export async function parseSessionFile(fileInfo, config) {
  const { filePath, project, sessionId, isSubagent } = fileInfo;

  // Honour the includeSubagents flag
  if (isSubagent && !config.includeSubagents) {
    return null;
  }

  const VALID_TYPES = new Set(['user', 'assistant', 'tool_result']);

  const events = [];
  let errorCount = 0;

  try {
    await new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });

      fileStream.on('error', reject);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '') {
          return; // skip blank lines silently
        }

        let obj;
        try {
          obj = JSON.parse(trimmed);
        } catch {
          errorCount += 1;
          return;
        }

        // Only keep recognised event types
        if (!VALID_TYPES.has(obj.type)) {
          return;
        }

        const raw = extractRawTimestamp(obj);
        const ts = normalizeTimestamp(raw);

        // Skip events with unparseable timestamps
        if (Number.isNaN(ts)) {
          return;
        }

        // Apply date-range filter
        if (ts < config.dateRange.from || ts > config.dateRange.to) {
          return;
        }

        events.push({ ts });
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // missing file — fail silently
    }
    throw err;
  }

  if (errorCount > 0) {
    process.stderr.write(
      `[warn] ${filePath}: ${errorCount} malformed lines skipped\n`,
    );
  }

  if (events.length === 0) {
    return null;
  }

  // Sort ascending by timestamp
  events.sort((a, b) => a.ts - b.ts);

  return {
    project,
    sessionId,
    isSubagent,
    events,
  };
}
