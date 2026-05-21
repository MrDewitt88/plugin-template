// @nexus-mindgarden/plugin-bridge-foundation/persona — Persona-Anchoring shape-contract.
//
// v0.5.0 ships SHAPE-ONLY (Zod-schemas + types + v0.6.0-runtime-contract).
// Runtime helper `createPersonaAnchoredAgent()` deferred to v0.6.0 — see
// `./types.ts` header-comment for the design-rationale + wiz-mind vote-trace.

export {
  // Sub-shapes
  PersonaSoulSchema,
  type PersonaSoul,
  PersonaDiaryEntrySchema,
  type PersonaDiaryEntry,
  PersonaDiarySchema,
  type PersonaDiary,
  PersonaMemorySchema,
  type PersonaMemory,

  // Enums
  PersonaRelationshipDispositionSchema,
  type PersonaRelationshipDisposition,
  PersonaLocaleSchema,
  type PersonaLocale,

  // Canonical input
  PersonaAnchorInputSchema,
  type PersonaAnchorInput,

  // v0.6.0+ runtime contract (locked in v0.5.0)
  type PersonaPromptBuildResult,
  type BuildPersonaPromptFn,
  type PersonaAnchoredAgentOptions,
  type PersonaAnchoredAgent,
} from './types.js'
