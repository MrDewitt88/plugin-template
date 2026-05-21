// @nexus-mindgarden/plugin-bridge-foundation/agent-complete — canonical Plugin-to-LLM
// Tool helper. Wire-Contract aus chatbus thread="contracts" 2026-05-21.

export {
  AgentCompleteError,
  agentCompleteText,
  createAgentComplete,
  type AgentCompleteFn,
  type CreateAgentCompleteOptions,
} from './client.js'

export {
  AgentCompleteRequestSchema,
  AgentCompleteResponseSchema,
  CacheRetentionSchema,
  ChatMessageSchema,
  ChatMessageRoleSchema,
  FinishReasonSchema,
  ResponseFormatSchema,
  StopReasonSchema,
  ToolCallSchema,
  UsageSchema,
  type AgentCompleteRequest,
  type AgentCompleteResponse,
  type CacheRetention,
  type ChatMessage,
  type ChatMessageRole,
  type FinishReason,
  type ResponseFormat,
  type StopReason,
  type ToolCall,
  type Usage,
} from './types.js'
