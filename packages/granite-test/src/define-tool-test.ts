// @nexus-mindgarden/granite-test — defineGraniteToolTest API
//
// Plugin-author-facing factory for declaring a tool's test-suite. Pure typed
// pass-through in v1.0; future versions may inject sensible defaults (e.g.
// auto-derive `case_id` from prompt-hash if omitted).

import type { GraniteToolTest } from './types.js'

/**
 * Declare a Granite-Floor test-suite for a single MCP-tool.
 *
 * Plugin-authors typically export an array of these from their
 * `granite-test.config.ts`:
 *
 * ```ts
 * import { defineGraniteToolTest } from '@nexus-mindgarden/granite-test'
 *
 * export default [
 *   // Plugin-tool (this plugin owns it):
 *   defineGraniteToolTest({
 *     tool: 'plug-elec.kabel.dimensionierung',
 *     persona: 'user',
 *     cases: [
 *       {
 *         case_id: 'kabel.16A-25m',
 *         prompt: 'Dimensioniere 16A Drehstromkreis 25m Länge',
 *         expected_tool_args: { strom: 16, phasen: 3, laenge: 25 },
 *         max_latency_ms: 8000,
 *       },
 *     ],
 *   }),
 *
 *   // Host-tool (v1.3+, host-shared, this plugin only consumes):
 *   defineGraniteToolTest({
 *     tool: 'image.generate',           // un-prefixed host-shared name
 *     persona: 'user',
 *     target_kind: 'host-tool',          // v0.0.6+ (spec v1.3)
 *     target_host: 'theseus',            // canonical theseus | v8 | v8-fam | markview
 *     cases: [
 *       {
 *         case_id: 'image.generate.pixel-tile-256',
 *         prompt: 'pixel-art forest tile, 16-bit, 256x256',
 *         expected_tool_args: { prompt: /pixel-art forest tile/i, width: 256, height: 256 },
 *         max_latency_ms: 30000,
 *       },
 *     ],
 *   }),
 * ]
 * ```
 *
 * The runner (`@nexus-mindgarden/granite-pilot-runner`, peerDep) consumes
 * this config, executes each case against Granite-4-tiny-4bit, and emits
 * `granite-floor.event.v1` events via `reportToCluster()` with the per-tool
 * `target_kind` + `target_host` (v1.3+) threaded into each event.
 */
export function defineGraniteToolTest(test: GraniteToolTest): GraniteToolTest {
  // v1.0: pure pass-through. Future versions may:
  //  - Auto-derive case_id from prompt+args hash if omitted
  //  - Validate tool-name matches plugin's manifest (requires Foundation /manifest helper)
  //  - Auto-set max_latency_ms from cluster-baseline if absent
  return test
}
