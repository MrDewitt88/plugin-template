// agent.complete — canonical Plugin-to-LLM Tool. Wire-Contract aus
// chatbus thread="contracts" 2026-05-21 (msg #443-449).
//
// Theseus shipped v0.15.0-agent-complete-endpoint (commit `51921ff`) mit
// @theseus/agent-complete-schema (lebt im Theseus monorepo bei
// packages/agent-complete-schema/).
//
// **Status hier**: bis Theseus' Schema-Package via npm publish'd ist, dupliziert
// plug-tmpl's Foundation die Schemas als minimal-faithful stop-gap. Sobald
// @theseus/agent-complete-schema verfügbar ist, ersetzen + re-export aus der
// peer-Dep. **DO NOT extend** dieses Schema hier — extend via Theseus' canonical
// package + Foundation v0.3.x bump.
//
// Cross-Reference:
// - Contract-Thread chatbus 2026-05-21 (msg #443 agent → all → group GO from
//   oracle/mind-canva #444, v8-corp #445, v8-fam #446 + sub-confirms)
// - Theseus tag https://github.com/MrDewitt88/Theseus-Agent/releases/tag/v0.15.0-agent-complete-endpoint
// - V8 Reverse-Call Design-Y per v8-corp msg #445: `/mcp/v1/call-tool` mit
//   `tool_name="agent.complete"` → forward zu `THESEUS_AGENT_URL/agent/complete`
import { z } from 'zod';
// === ChatMessage ===
export const ChatMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export const ChatMessageSchema = z.object({
    role: ChatMessageRoleSchema,
    content: z.string(),
    // For role='tool': result of a previous tool-call
    tool_call_id: z.string().optional(),
    // For role='assistant': tool-calls the model requested
    tool_calls: z
        .array(z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.unknown(),
    }))
        .optional(),
});
// === Response-Format ===
export const ResponseFormatSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('text') }),
    z.object({ type: z.literal('json_object') }),
    z.object({ type: z.literal('json_schema'), schema: z.record(z.unknown()) }),
]);
// === Cache-Retention (msg #449 Luma's C) ===
export const CacheRetentionSchema = z.enum(['none', 'short', 'long']);
// === Request ===
export const AgentCompleteRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1),
    /** Optional model override; default = Theseus' active model. */
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    /** none = no cache marker; short = ~5min TTL (Anthropic-compat); long = ~1h TTL */
    cacheRetention: CacheRetentionSchema.optional(),
    responseFormat: ResponseFormatSchema.optional(),
    /** Future work — non-streaming is v0.3.0 default. */
    stream: z.literal(false).optional(),
});
// === Response ===
export const StopReasonSchema = z.enum(['stop', 'max_iterations', 'aborted', 'error']);
export const FinishReasonSchema = z.enum(['stop', 'length', 'tool_calls', 'content_filter']);
export const ToolCallSchema = z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.unknown(),
});
export const UsageSchema = z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
});
export const AgentCompleteResponseSchema = z.object({
    text: z.string(),
    toolCalls: z.array(ToolCallSchema).default([]),
    stopReason: StopReasonSchema,
    finishReason: FinishReasonSchema.optional(),
    usage: UsageSchema.optional(),
    error: z
        .object({
        code: z.string(),
        message: z.string(),
        retryable: z.boolean().optional(),
    })
        .optional(),
});
//# sourceMappingURL=types.js.map