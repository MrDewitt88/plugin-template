// @nexus-mindgarden/plugin-bridge-foundation/persona — Persona-Anchoring shape-contract.
//
// v0.5.0: SHAPE-ONLY (no runtime helper). Locks the canonical PersonaAnchorInput
// contract so plug-tmpl-cluster plugins can code against a shared shape today —
// `import type { PersonaAnchorInput }` for compile-time-check + drift-immunity —
// without committing the Foundation to a runtime impl nobody-yet-needs.
//
// v0.6.0+ will add `createPersonaAnchoredAgent()` runtime-helper under the SAME
// subpath (additive, non-breaking) when ≥2 consumers signal explicit runtime
// need. Until then this is a pure contract-lock.
//
// Source: wiz-mind msg #570 + #573 vote 3c. Shape covers ~80% from msg #570
// baseline + 4 extensions logged in msg #570:
//   - `locale` (lang-dependent narrator-persona, Granite-Floor §3.5 finding)
//   - `setting_anchor` (genre-prefix mandatory — prevents Granite-class drift
//     to contemporary-fiction baseline)
//   - `npc_voice_style` (optional NPC-dialogue voice-anchor, Phase-7-pattern)
//   - `relationship_disposition` (optional NPC-state — mutates LLM-tone)
//
// Multi-NPC pattern: multiple parallel instances (one PersonaAnchorInput per
// NPC), NOT a Record<NpcId, ...>-map. Each instance owns its own anchor +
// downstream agent-complete-roundtrip — cleaner per-NPC test-isolation +
// per-NPC RAG-recall channels.

import { z } from 'zod'

// --- SOUL — the persona's identity (immutable per scene) ---

export const PersonaSoulSchema = z.object({
  name: z.string().min(1), // e.g. "Lyra, the Cartographer"
  values: z.array(z.string()).default([]), // e.g. ["curiosity", "loyalty to the user"]
  tone: z.string().min(1), // e.g. "warm, slightly melancholic"
})
export type PersonaSoul = z.infer<typeof PersonaSoulSchema>

// --- DIARY — recent event-summaries (typically last N scenes) ---

export const PersonaDiaryEntrySchema = z.object({
  when: z.string(), // ISO timestamp OR relative ("two scenes ago")
  what: z.string().min(1), // 1-3 sentence event-summary
})
export type PersonaDiaryEntry = z.infer<typeof PersonaDiaryEntrySchema>

export const PersonaDiarySchema = z.object({
  entries: z.array(PersonaDiaryEntrySchema).default([]),
})
export type PersonaDiary = z.infer<typeof PersonaDiarySchema>

// --- MEMORY — hot/cold context split ---

export const PersonaMemorySchema = z.object({
  recent: z.array(z.string()).default([]), // chat-context, newest-last
  persistent: z.array(z.string()).default([]), // long-term facts
})
export type PersonaMemory = z.infer<typeof PersonaMemorySchema>

// --- Disposition enum (wiz-mind extension #4) ---
// NPC-relationship-state mutates the LLM's tone-anchor. 'dead' is intentionally
// in the enum: dead NPCs can still surface in memory-callbacks (e.g. via DIARY
// references), and consumers may want to render their voice with grave-pacing.

export const PersonaRelationshipDispositionSchema = z.enum([
  'trust',
  'neutral',
  'distrust',
  'hostile',
  'dead',
])
export type PersonaRelationshipDisposition = z.infer<typeof PersonaRelationshipDispositionSchema>

// --- Locale enum (wiz-mind extension #1) ---
// Narrator-persona prompt-template is language-dependent (Granite-Floor §3.5
// finding: German vs English narrator-tone diverges enough that mixing degrades
// output quality). Add more locales additively as Foundation-cluster expands.

export const PersonaLocaleSchema = z.enum(['de', 'en'])
export type PersonaLocale = z.infer<typeof PersonaLocaleSchema>

// --- PersonaAnchorInput — the canonical shape ---

export const PersonaAnchorInputSchema = z.object({
  soul: PersonaSoulSchema,
  diary: PersonaDiarySchema,
  memory: PersonaMemorySchema,

  // wiz-mind extension #1 — required (no sensible Foundation-default)
  locale: PersonaLocaleSchema,

  // wiz-mind extension #2 — required (Granite-Floor §3.5: omitting causes
  // contemporary-fiction drift in narrator-prompts). Free-text — consumers
  // shape it per genre, e.g. "high-fantasy, post-cataclysm" or "noir-detective,
  // 1940s Chicago".
  setting_anchor: z.string().min(1),

  // wiz-mind extension #3 — optional, for NPC-dialogue (Phase-7-pattern)
  npc_voice_style: z.string().optional(),

  // wiz-mind extension #4 — optional, NPC-state-aware tone-mutation
  relationship_disposition: PersonaRelationshipDispositionSchema.optional(),

  // Optional metadata for multi-NPC tracing / per-NPC RAG-recall channels.
  // Multiple parallel-instances pattern: each anchored agent owns ONE npc_id
  // (or none, for single-NPC scenes). NOT a Record<NpcId, ...>-map.
  npc_id: z.string().optional(),
})
export type PersonaAnchorInput = z.infer<typeof PersonaAnchorInputSchema>

// --- v0.6.0+ runtime-helper contract (locked shape, impl deferred) ---
//
// The following types lock the SHAPE of the eventual `createPersonaAnchoredAgent()`
// runtime-helper. v0.5.0 does NOT export a runtime impl — these are pure
// type-contracts so consumers can codify their own builders against them today
// + swap to Foundation-runtime in v0.6.0 without shape-changes.

export interface PersonaPromptBuildResult {
  /** System-prompt — fixed persona/setting-anchor goes here. */
  systemPrompt: string
  /** User-prompt — the actual turn the LLM should respond to. */
  userPrompt: string
}

/**
 * Override-callback signature (wiz-mind msg #570 vote: callback-override-pattern
 * instead of ENV-template). Default-anchoring-logic stays deterministic; consumers
 * with custom prompt-shaping needs (e.g. wiz-mind world.setting_anchor +
 * locale-specific tone + {memory.*}-slot interpolation) pass a `buildPrompt`
 * override.
 *
 * The function receives the validated `PersonaAnchorInput` and returns the
 * system+user-prompt pair to be sent to `agent.complete`.
 */
export type BuildPersonaPromptFn = (anchor: PersonaAnchorInput) => PersonaPromptBuildResult

/**
 * Options-shape for the v0.6.0+ runtime helper. Locked in v0.5.0.
 */
export interface PersonaAnchoredAgentOptions {
  /** URL to the `agent.complete`-endpoint (typically a Host-relay). */
  agentCompleteEndpoint: string
  /** The persona-anchor for THIS instance (one anchor per NPC for multi-NPC scenes). */
  anchor: PersonaAnchorInput
  /** Optional prompt-builder override (escape-hatch for custom-prompt-shaping). */
  buildPrompt?: BuildPersonaPromptFn
}

/**
 * Returned-instance-shape for the v0.6.0+ runtime helper. Locked in v0.5.0.
 *
 * Note: deliberately NARROW — no streaming, no multi-turn-history-management,
 * no automatic memory-write-back. Those are plugin-side concerns (consumer
 * persists DIARY/MEMORY updates via their own storage, e.g. `@plug-db/client`).
 */
export interface PersonaAnchoredAgent {
  complete: (userPrompt: string) => Promise<{ text: string }>
}
