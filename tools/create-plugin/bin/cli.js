#!/usr/bin/env node
// CLI binary — compiled from src/cli.ts via tsc.
import { runCli } from '../dist/cli.js'

// NIE process.exit() hier: das beendet den Prozess, bevor Node einen asynchronen
// stdout-Write in eine PIPE geleert hat — Ausgaben über der Pipe-Puffergröße
// (64 KiB) würden still abgeschnitten, mit exit 0. Das trifft genau den
// dokumentierten `features-note | append_note`-Pfad bei großen Manifesten.
// `process.exitCode` setzen und Node normal auslaufen lassen leert die Pipe.
runCli(process.argv).then(
  (code) => {
    process.exitCode = code
  },
  (err) => {
    console.error('unexpected error:', err)
    process.exitCode = 2
  },
)
