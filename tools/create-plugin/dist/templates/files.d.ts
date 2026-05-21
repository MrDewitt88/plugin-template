export interface TemplateFile {
    /** Relative path to repo-root, may contain placeholders */
    path: string;
    /** File-content with {{placeholders}} */
    content: string;
    /** Optional: only include if this feature in --features=... */
    feature?: 'bridge' | 'storage' | 'svelte' | 'mcp';
}
export declare const TEMPLATE_FILES: TemplateFile[];
//# sourceMappingURL=files.d.ts.map