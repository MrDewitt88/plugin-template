import type { Context } from 'hono';
import { type HookHandler } from '../types.js';
export declare function invokeHookHandler(handlers: Record<string, HookHandler>): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
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
//# sourceMappingURL=invoke-hook.d.ts.map