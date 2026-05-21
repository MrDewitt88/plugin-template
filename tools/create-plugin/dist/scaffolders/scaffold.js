// Scaffolder — render templates + write to filesystem.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { TEMPLATE_FILES } from '../templates/files.js';
import { buildContext, render } from '../templates/render.js';
export class ScaffoldError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ScaffoldError';
    }
}
/**
 * Render alle templates + write files. Returns liste der geschriebenen
 * Files für summary.
 *
 * Skipt files mit feature-flag wenn feature nicht in opts.features.
 */
export function scaffold(opts) {
    const target = resolve(opts.target);
    if (existsSync(target) && !opts.force) {
        throw new ScaffoldError('target_exists', `target dir already exists: ${target} (use --force to overwrite)`);
    }
    const context = buildContext({
        pluginName: opts.pluginName,
        hosts: opts.hosts,
        features: opts.features,
    });
    const written = [];
    for (const file of TEMPLATE_FILES) {
        if (file.feature && !opts.features.includes(file.feature))
            continue;
        const renderedPath = render(file.path, context);
        const renderedContent = render(file.content, context);
        const fullPath = join(target, renderedPath);
        try {
            mkdirSync(dirname(fullPath), { recursive: true });
            writeFileSync(fullPath, renderedContent, 'utf-8');
            written.push(renderedPath);
        }
        catch (err) {
            throw new ScaffoldError('write_failed', `failed to write ${fullPath}: ${err.message}`);
        }
    }
    return { filesWritten: written, target, context };
}
//# sourceMappingURL=scaffold.js.map