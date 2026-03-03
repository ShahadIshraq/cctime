import { parseConfig } from './config.js';
import { discoverSessionFiles } from './discover.js';
import { parseSessionFile } from './parse.js';
import { clusterIntoBlocks } from './cluster.js';
import { mergeIntervals } from './merge.js';
import { aggregateByDay, blocksByDay, formatReport } from './aggregate.js';

async function main() {
  // Step 1: Parse config from CLI args
  const config = parseConfig(process.argv.slice(2));
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

  // Step 4: Group by project, folding subagent events into parent
  const projectMap = new Map();

  for (const result of parsedResults) {
    const project = result.project;

    if (result.isSubagent) {
      // Merge subagent events into parent project's event list
      if (!projectMap.has(project)) {
        projectMap.set(project, []);
      }
      projectMap.get(project).push(...result.events);
    } else {
      if (!projectMap.has(project)) {
        projectMap.set(project, []);
      }
      projectMap.get(project).push(...result.events);
    }
  }

  // Step 5: Per project — sort events, cluster into blocks, merge intervals
  const projectBlocks = new Map();

  for (const [project, events] of projectMap) {
    events.sort((a, b) => a.ts - b.ts);
    const blocks = clusterIntoBlocks(events, config.pauseThreshold);
    const merged = mergeIntervals(blocks);
    projectBlocks.set(project, merged);
  }

  // Step 6: Cross-project handling
  process.stderr.write('Computing daily totals...\n');

  let finalBlocks;

  if (config.crossProjectOverlap === 'merge') {
    const allBlocks = [];
    for (const blocks of projectBlocks.values()) {
      allBlocks.push(...blocks);
    }
    finalBlocks = mergeIntervals(allBlocks);
  } else {
    // 'accumulate': concatenate all project blocks, no cross-project merge
    finalBlocks = [];
    for (const blocks of projectBlocks.values()) {
      finalBlocks.push(...blocks);
    }
  }

  // Step 7: Aggregate by day
  const dailyTotals = aggregateByDay(finalBlocks);
  const dayBlocksMap = blocksByDay(finalBlocks);

  // Step 8: Format report
  const report = formatReport(dailyTotals, config, dayBlocksMap);

  // Step 9: Print to stdout
  console.log(report);
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
