#!/usr/bin/env node
// CLI binary — compiled from src/cli.ts via tsc.
import { runCli } from '../dist/cli.js'

runCli(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    console.error('unexpected error:', err)
    process.exit(2)
  },
)
