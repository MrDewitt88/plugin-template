import type { Context } from 'hono';
import { type ToolHandler } from '../types.js';
export declare function executeToolHandler(handlers: Record<string, ToolHandler>): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    error: {
        code: string;
        message: string;
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    ok: false;
    error: {
        code: string;
        message: string;
    };
}, import("hono/utils/http-status").ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
    ok: true;
    result: import("hono/utils/types").JSONValue;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
//# sourceMappingURL=execute-tool.d.ts.map