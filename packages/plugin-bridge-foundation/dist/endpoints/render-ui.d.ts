import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { type RenderUiHandler } from '../types.js';
export declare function renderUiHandler(handler: RenderUiHandler): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    html: string;
    scripts: string[];
    styles: string[];
}, ContentfulStatusCode, "json">) | (Response & import("hono").TypedResponse<{
    error: {
        code: string;
        message: string;
    };
}, 100 | 400 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511 | -1, "json">)>;
//# sourceMappingURL=render-ui.d.ts.map