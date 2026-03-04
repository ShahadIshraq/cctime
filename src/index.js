import fs from 'fs';
import { parseConfig } from './config.js';
import { discoverSessionFiles } from './discover.js';
import { parseSessionFile } from './parse.js';
import { clusterIntoBlocks } from './cluster.js';
import { mergeIntervals } from './merge.js';
import { aggregateByDay, blocksByDay, formatReport } from './aggregate.js';
import { formatReportPretty } from './format.js';

/**
 * Run the full ccworktime pipeline.
 *
 * @param {string[]} argv - CLI arguments (process.argv.slice(2))
 * @returns {Promise<void>}
 */
export async function run(argv) {
  // Step 1: Parse config from CLI args
  const config = parseConfig(argv);

  try {
    fs.accessSync(config.claudeDir, fs.constants.R_OK);
  } catch {
    throw new Error(`Claude directory not found at ${config.claudeDir}. Is Claude Code installed?`);
  }

  process.stderr.write('Scanning for sessions...\n');

  // Step 2: Discover session files
  const fileInfos = await discoverSessionFiles(config);
  process.stderr.write(`Found ${fileInfos.length} session files\n`);

  if (fileInfos.length === 0) {
    console.log('No session files found for the specified period.');
    return;
  }

  // Step 3: Parse all session files in parallel, filter out nulls
  const allResults = await Promise.all(
    fileInfos.map(fi => parseSessionFile(fi, config))
  );
  const parsedResults = allResults.filter(result => result !== null);
  process.stderr.write(`Parsed ${parsedResults.length} sessions with activity\n`);

  if (parsedResults.length === 0) {
    console.log('No activity found for the specified period.');
    return;
  }

  // Step 4: Build final blocks based on overlap mode
  process.stderr.write('Computing daily totals...\n');

  let finalBlocks;

  if (config.crossProjectOverlap === 'merge') {
    // Merge mode: combine ALL events across projects, cluster once, merge once.
    // This ensures nearby activity from different sub-projects is treated as
    // continuous work rather than separate blocks.
    const allEvents = [];
    for (const result of parsedResults) {
      allEvents.push(...result.events);
    }
    allEvents.sort((a, b) => a.ts - b.ts);
    const blocks = clusterIntoBlocks(allEvents, config.pauseThreshold);
    finalBlocks = mergeIntervals(blocks);
  } else {
    // Accumulate mode: cluster per project independently, no cross-project merge.
    const projectMap = new Map();
    for (const result of parsedResults) {
      if (!projectMap.has(result.project)) {
        projectMap.set(result.project, []);
      }
      projectMap.get(result.project).push(...result.events);
    }

    finalBlocks = [];
    for (const [, events] of projectMap) {
      events.sort((a, b) => a.ts - b.ts);
      const blocks = clusterIntoBlocks(events, config.pauseThreshold);
      const merged = mergeIntervals(blocks);
      finalBlocks.push(...merged);
    }
  }

  // Step 7: Aggregate by day
  const dailyTotals = aggregateByDay(finalBlocks);
  const dayBlocksMap = blocksByDay(finalBlocks);

  // Step 8: Format report
  const usePretty = process.stdout.isTTY && !process.env.NO_COLOR;
  const report = usePretty
    ? formatReportPretty(dailyTotals, config, dayBlocksMap)
    : formatReport(dailyTotals, config, dayBlocksMap);

  // Step 9: Print to stdout
  console.log(report);
}
