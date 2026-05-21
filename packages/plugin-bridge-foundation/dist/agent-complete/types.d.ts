import { z } from 'zod';
export declare const ChatMessageRoleSchema: z.ZodEnum<["system", "user", "assistant", "tool"]>;
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;
export declare const ChatMessageSchema: z.ZodObject<{
    role: z.ZodEnum<["system", "user", "assistant", "tool"]>;
    content: z.ZodString;
    tool_call_id: z.ZodOptional<z.ZodString>;
    tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        arguments: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        arguments?: unknown;
    }, {
        name: string;
        id: string;
        arguments?: unknown;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "system" | "assistant" | "tool";
    content: string;
    tool_call_id?: string | undefined;
    tool_calls?: {
        name: string;
        id: string;
        arguments?: unknown;
    }[] | undefined;
}, {
    role: "user" | "system" | "assistant" | "tool";
    content: string;
    tool_call_id?: string | undefined;
    tool_calls?: {
        name: string;
        id: string;
        arguments?: unknown;
    }[] | undefined;
}>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export declare const ResponseFormatSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"text">;
}, "strip", z.ZodTypeAny, {
    type: "text";
}, {
    type: "text";
}>, z.ZodObject<{
    type: z.ZodLiteral<"json_object">;
}, "strip", z.ZodTypeAny, {
    type: "json_object";
}, {
    type: "json_object";
}>, z.ZodObject<{
    type: z.ZodLiteral<"json_schema">;
    schema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    type: "json_schema";
    schema: Record<string, unknown>;
}, {
    type: "json_schema";
    schema: Record<string, unknown>;
}>]>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export declare const CacheRetentionSchema: z.ZodEnum<["none", "short", "long"]>;
export type CacheRetention = z.infer<typeof CacheRetentionSchema>;
export declare const AgentCompleteRequestSchema: z.ZodObject<{
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["system", "user", "assistant", "tool"]>;
        content: z.ZodString;
        tool_call_id: z.ZodOptional<z.ZodString>;
        tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            arguments: z.ZodUnknown;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id: string;
            arguments?: unknown;
        }, {
            name: string;
            id: string;
            arguments?: unknown;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "system" | "assistant" | "tool";
        content: string;
        tool_call_id?: string | undefined;
        tool_calls?: {
            name: string;
            id: string;
            arguments?: unknown;
        }[] | undefined;
    }, {
        role: "user" | "system" | "assistant" | "tool";
        content: string;
        tool_call_id?: string | undefined;
        tool_calls?: {
            name: string;
            id: string;
            arguments?: unknown;
        }[] | undefined;
    }>, "many">;
    /** Optional model override; default = Theseus' active model. */
    model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    /** none = no cache marker; short = ~5min TTL (Anthropic-compat); long = ~1h TTL */
    cacheRetention: z.ZodOptional<z.ZodEnum<["none", "short", "long"]>>;
    responseFormat: z.ZodOptional<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"text">;
    }, "strip", z.ZodTypeAny, {
        type: "text";
    }, {
        type: "text";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"json_object">;
    }, "strip", z.ZodTypeAny, {
        type: "json_object";
    }, {
        type: "json_object";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"json_schema">;
        schema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "json_schema";
        schema: Record<string, unknown>;
    }, {
        type: "json_schema";
        schema: Record<string, unknown>;
    }>]>>;
    /** Future work — non-streaming is v0.3.0 default. */
    stream: z.ZodOptional<z.ZodLiteral<false>>;
}, "strip", z.ZodTypeAny, {
    messages: {
        role: "user" | "system" | "assistant" | "tool";
        content: string;
        tool_call_id?: string | undefined;
        tool_calls?: {
            name: string;
            id: string;
            arguments?: unknown;
        }[] | undefined;
    }[];
    model?: string | undefined;
    temperature?: number | undefined;
    maxTokens?: number | undefined;
    cacheRetention?: "none" | "short" | "long" | undefined;
    responseFormat?: {
        type: "text";
    } | {
        type: "json_object";
    } | {
        type: "json_schema";
        schema: Record<string, unknown>;
    } | undefined;
    stream?: false | undefined;
}, {
    messages: {
        role: "user" | "system" | "assistant" | "tool";
        content: string;
        tool_call_id?: string | undefined;
        tool_calls?: {
            name: string;
            id: string;
            arguments?: unknown;
        }[] | undefined;
    }[];
    model?: string | undefined;
    temperature?: number | undefined;
    maxTokens?: number | undefined;
    cacheRetention?: "none" | "short" | "long" | undefined;
    responseFormat?: {
        type: "text";
    } | {
        type: "json_object";
    } | {
        type: "json_schema";
        schema: Record<string, unknown>;
    } | undefined;
    stream?: false | undefined;
}>;
export type AgentCompleteRequest = z.infer<typeof AgentCompleteRequestSchema>;
export declare const StopReasonSchema: z.ZodEnum<["stop", "max_iterations", "aborted", "error"]>;
export type StopReason = z.infer<typeof StopReasonSchema>;
export declare const FinishReasonSchema: z.ZodEnum<["stop", "length", "tool_calls", "content_filter"]>;
export type FinishReason = z.infer<typeof FinishReasonSchema>;
export declare const ToolCallSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    arguments: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    arguments?: unknown;
}, {
    name: string;
    id: string;
    arguments?: unknown;
}>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export declare const UsageSchema: z.ZodObject<{
    promptTokens: z.ZodNumber;
    completionTokens: z.ZodNumber;
    totalTokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}>;
export type Usage = z.infer<typeof UsageSchema>;
export declare const AgentCompleteResponseSchema: z.ZodObject<{
    text: z.ZodString;
    toolCalls: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        arguments: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        arguments?: unknown;
    }, {
        name: string;
        id: string;
        arguments?: unknown;
    }>, "many">>;
    stopReason: z.ZodEnum<["stop", "max_iterations", "aborted", "error"]>;
    finishReason: z.ZodOptional<z.ZodEnum<["stop", "length", "tool_calls", "content_filter"]>>;
    usage: z.ZodOptional<z.ZodObject<{
        promptTokens: z.ZodNumber;
        completionTokens: z.ZodNumber;
        totalTokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    }, {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    }>>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        retryable: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        retryable?: boolean | undefined;
    }, {
        code: string;
        message: string;
        retryable?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    text: string;
    toolCalls: {
        name: string;
        id: string;
        arguments?: unknown;
    }[];
    stopReason: "aborted" | "error" | "stop" | "max_iterations";
    error?: {
        code: string;
        message: string;
        retryable?: boolean | undefined;
    } | undefined;
    finishReason?: "length" | "tool_calls" | "stop" | "content_filter" | undefined;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    } | undefined;
}, {
    text: string;
    stopReason: "aborted" | "error" | "stop" | "max_iterations";
    error?: {
        code: string;
        message: string;
        retryable?: boolean | undefined;
    } | undefined;
    toolCalls?: {
        name: string;
        id: string;
        arguments?: unknown;
    }[] | undefined;
    finishReason?: "length" | "tool_calls" | "stop" | "content_filter" | undefined;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    } | undefined;
}>;
export type AgentCompleteResponse = z.infer<typeof AgentCompleteResponseSchema>;
//# sourceMappingURL=types.d.ts.map