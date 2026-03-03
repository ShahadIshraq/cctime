import fs from 'fs';
import readline from 'readline';
import path from 'path';

import { normalizeTimestamp } from './parse.js';

/**
 * Encode a project path so it can be used as a directory name under
 * `{claudeDir}/projects/`.
 *
 * '/Users/foo/workspace/bar' → '-Users-foo-workspace-bar'
 *
 * @param {string} projectPath
 * @returns {string}
 */
function encodeProjectPath(projectPath) {
  return projectPath.replace(/\//g, '-');
}

/**
 * UUID-like filename pattern: 36-character names such as
 * `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.jsonl`
 */
const UUID_JSONL_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

/**
 * Scan an encoded project directory for UUID-named `.jsonl` files.
 *
 * @param {string} encodedProjectDir  absolute path to the encoded project dir
 * @param {string} project            original project path string
 * @returns {Promise<Array<{filePath:string,project:string,sessionId:string,isSubagent:boolean}>>}
 */
async function scanProjectDirForUuidFiles(encodedProjectDir, project) {
  let entries;
  try {
    entries = await fs.promises.readdir(encodedProjectDir);
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    if (!UUID_JSONL_RE.test(entry)) {
      continue;
    }
    const filePath = path.join(encodedProjectDir, entry);
    const sessionId = entry.slice(0, -'.jsonl'.length); // strip extension
    results.push({ filePath, project, sessionId, isSubagent: false });
  }
  return results;
}

/**
 * Discover subagent files that live in a per-session sub-directory.
 *
 * Checks if `{encodedProjectDir}/{sessionId}/` exists and, if so, globs for
 * files whose name matches `agent-*.jsonl`.
 *
 * @param {string} encodedProjectDir
 * @param {string} project
 * @param {string} sessionId
 * @returns {Promise<Array<{filePath:string,project:string,sessionId:string,isSubagent:boolean}>>}
 */
async function discoverSubagentFiles(encodedProjectDir, project, sessionId) {
  const subDir = path.join(encodedProjectDir, sessionId);

  let entries;
  try {
    entries = await fs.promises.readdir(subDir);
  } catch {
    return []; // directory absent — no subagent files
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.startsWith('agent-') || !entry.endsWith('.jsonl')) {
      continue;
    }
    results.push({
      filePath: path.join(subDir, entry),
      project,
      sessionId,
      isSubagent: true,
    });
  }
  return results;
}

/**
 * Perform a full directory scan of `{claudeDir}/projects/` when
 * `history.jsonl` is missing.
 *
 * @param {string} claudeDir
 * @returns {Promise<Array<{filePath:string,project:string,sessionId:string,isSubagent:boolean}>>}
 */
async function fullProjectsScan(claudeDir) {
  const projectsDir = path.join(claudeDir, 'projects');

  let subdirs;
  try {
    subdirs = await fs.promises.readdir(projectsDir);
  } catch {
    return [];
  }

  const results = [];
  for (const subdir of subdirs) {
    const encodedProjectDir = path.join(projectsDir, subdir);

    // Only process directories
    let stat;
    try {
      stat = await fs.promises.stat(encodedProjectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }

    // Treat the encoded directory name as a synthetic project identifier.
    // We cannot reliably reverse the encoding (hyphens are ambiguous), so
    // we use the encoded form as the project value for files found here.
    const project = subdir;

    const found = await scanProjectDirForUuidFiles(encodedProjectDir, project);
    results.push(...found);
  }

  return results;
}

/**
 * Read `history.jsonl` line by line and return structured entries.
 *
 * @param {string} historyPath
 * @param {{ dateRange: { from: number, to: number }, projectFilter: string[]|null }} config
 * @returns {Promise<Array<{sessionId:string|undefined,project:string,ts:number}>>}
 */
async function readHistoryEntries(historyPath, config) {
  const entries = [];

  await new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(historyPath, { encoding: 'utf8' });
    fileStream.on('error', reject);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed === '') {
        return;
      }

      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        return; // skip malformed lines silently
      }

      // Normalize timestamp and apply date-range filter
      const ts = normalizeTimestamp(obj.timestamp);
      if (Number.isNaN(ts)) {
        return;
      }
      if (ts < config.dateRange.from || ts > config.dateRange.to) {
        return;
      }

      // Apply project filter (prefix match — a filter path also matches all sub-directories)
      if (
        config.projectFilter !== null &&
        !config.projectFilter.some(
          (filter) =>
            obj.project === filter || obj.project.startsWith(filter + '/')
        )
      ) {
        return;
      }

      entries.push({
        sessionId: obj.sessionId, // may be undefined
        project: obj.project,
        ts,
      });
    });

    rl.on('close', resolve);
    rl.on('error', reject);
  });

  return entries;
}

/**
 * Discover all session JSONL files relevant to the given config.
 *
 * @param {{
 *   pauseThreshold: number,
 *   crossProjectOverlap: string,
 *   dateRange: { from: number, to: number },
 *   projectFilter: string[]|null,
 *   includeSubagents: boolean,
 *   claudeDir: string,
 * }} config
 * @returns {Promise<Array<{filePath:string,project:string,sessionId:string,isSubagent:boolean}>>}
 */
export async function discoverSessionFiles(config) {
  const { claudeDir } = config;
  const historyPath = path.join(claudeDir, 'history.jsonl');

  // Deduplicate by absolute file path
  const seen = new Set();

  /**
   * Push a fileInfo object only if its filePath has not been seen before.
   *
   * @param {Array} results
   * @param {{filePath:string,project:string,sessionId:string,isSubagent:boolean}} info
   */
  function pushUnique(results, info) {
    if (seen.has(info.filePath)) {
      return;
    }
    seen.add(info.filePath);
    results.push(info);
  }

  // -------------------------------------------------------------------------
  // Missing history.jsonl → full directory scan fallback
  // -------------------------------------------------------------------------
  let historyExists = false;
  try {
    await fs.promises.access(historyPath, fs.constants.R_OK);
    historyExists = true;
  } catch {
    process.stderr.write(
      `[warn] history.jsonl not found at ${historyPath}; falling back to full directory scan\n`,
    );
  }

  if (!historyExists) {
    const fallback = await fullProjectsScan(claudeDir);
    const results = [];
    for (const info of fallback) {
      pushUnique(results, info);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Step 1: Read history.jsonl
  // -------------------------------------------------------------------------
  let historyEntries;
  try {
    historyEntries = await readHistoryEntries(historyPath, config);
  } catch (err) {
    process.stderr.write(
      `[warn] Failed to read history.jsonl: ${err.message}; falling back to full directory scan\n`,
    );
    const fallback = await fullProjectsScan(claudeDir);
    const results = [];
    for (const info of fallback) {
      pushUnique(results, info);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Step 2 & 3: Separate entries with and without sessionId
  // -------------------------------------------------------------------------

  // Map keyed by sessionId to dedup — value is the project string
  const sessionMap = new Map();
  // Projects that had no sessionId (need fallback directory scan)
  const fallbackProjects = new Set();

  for (const entry of historyEntries) {
    if (entry.sessionId) {
      if (!sessionMap.has(entry.sessionId)) {
        sessionMap.set(entry.sessionId, entry.project);
      }
    } else {
      fallbackProjects.add(entry.project);
    }
  }

  const results = [];

  // -------------------------------------------------------------------------
  // Step 4: Build file list for entries with sessionId
  // -------------------------------------------------------------------------
  for (const [sessionId, project] of sessionMap) {
    const encodedProjectDir = path.join(
      claudeDir,
      'projects',
      encodeProjectPath(project),
    );
    const sessionFilePath = path.join(encodedProjectDir, `${sessionId}.jsonl`);

    // Check existence of the main session file
    let fileExists = false;
    try {
      await fs.promises.access(sessionFilePath, fs.constants.F_OK);
      fileExists = true;
    } catch {
      // missing — skip silently
    }

    if (fileExists) {
      pushUnique(results, {
        filePath: sessionFilePath,
        project,
        sessionId,
        isSubagent: false,
      });

      // Discover subagent files for this session
      const subagentFiles = await discoverSubagentFiles(
        encodedProjectDir,
        project,
        sessionId,
      );
      for (const info of subagentFiles) {
        pushUnique(results, info);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Fallback scan for projects without sessionId
  // -------------------------------------------------------------------------
  for (const project of fallbackProjects) {
    const encodedProjectDir = path.join(
      claudeDir,
      'projects',
      encodeProjectPath(project),
    );
    const found = await scanProjectDirForUuidFiles(encodedProjectDir, project);
    for (const info of found) {
      pushUnique(results, info);
    }
  }

  return results;
}
