#!/usr/bin/env bun

import pkg from '../package.json';
import { run } from '../src/index.js';

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

run(args).catch(err => {
  if (err.message.startsWith('__HELP__')) {
    process.stdout.write(err.message.slice('__HELP__'.length) + '\n');
    process.exit(0);
  }
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
