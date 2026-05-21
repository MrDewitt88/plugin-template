// 16-Token-Convention für Plugin-Components.
// Reference: MarkView Phase-2 `26aca39` mit `--mv-color-*` als Beispiel.
//
// Plugin-Provider definiert eigenen Prefix (z.B. `--mv-` für MarkView,
// `--kanban-` für KANBAN) und exportiert canonical Token-Set für
// Component-CSS.
//
// Token-Set deckt: text/background/accent/borders/inputs/cards/chips/
// info/error/warn states. Light + dark Token-Werte.
/**
 * Standard light-theme token-werte. Plugin-Provider override-bar pro
 * Component falls Brand-Differentiation nötig.
 */
export const STANDARD_LIGHT = {
    fg: '#1a1a1a',
    bg: '#ffffff',
    muted: '#6b7280',
    accent: '#2563eb',
    accentFg: '#ffffff',
    kiara: '#9333ea',
    kiaraFg: '#ffffff',
    border: '#e5e7eb',
    inputBg: '#f9fafb',
    cardBg: '#ffffff',
    chipBg: '#f3f4f6',
    infoBg: '#dbeafe',
    errorBg: '#fee2e2',
    errorFg: '#991b1b',
    warnBg: '#fef3c7',
    warnFg: '#92400e',
};
/**
 * Standard dark-theme token-werte. Werte aus MarkView's
 * theme-attribute-Adoption übernommen (consistent cross-plugin look).
 */
export const STANDARD_DARK = {
    fg: '#e5e7eb',
    bg: '#0f172a',
    muted: '#94a3b8',
    accent: '#3b82f6',
    accentFg: '#ffffff',
    kiara: '#a855f7',
    kiaraFg: '#ffffff',
    border: '#1e293b',
    inputBg: '#1e293b',
    cardBg: '#0f172a',
    chipBg: '#1e293b',
    infoBg: '#1e3a8a',
    errorBg: '#7f1d1d',
    errorFg: '#fecaca',
    warnBg: '#78350f',
    warnFg: '#fde68a',
};
/**
 * Erzeugt CSS-Custom-Property-Block für `:host`-Selector.
 * Output:
 *   :host { --<prefix>-color-fg: #1a1a1a; --<prefix>-color-bg: ...; ... }
 *
 * Plugin-Component hängt das in seinen `<style>`-Block.
 */
export function tokensToCss(prefix, tokens) {
    const camelToKebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    const lines = Object.entries(tokens).map(([k, v]) => `  --${prefix}-color-${camelToKebab(k)}: ${v};`);
    return lines.join('\n');
}
/**
 * Generiert komplettes light+dark+auto-fallback CSS-Block für Component-
 * <style>. Plugin-Component embedded das via Svelte's `<style>` direkt.
 *
 * Output:
 *   :host { ...light tokens... }
 *   :host([theme="dark"]) { ...dark tokens... }
 *   @media (prefers-color-scheme: dark) {
 *     :host([theme="auto"]),
 *     :host(:not([theme])) { ...dark tokens... }
 *   }
 */
export function buildThemeCss(prefix, light = STANDARD_LIGHT, dark = STANDARD_DARK) {
    return `
/* THEME-TOKENS-BEGIN — generated via @nexus/plugin-svelte-foundation */
:host {
${tokensToCss(prefix, light)}
}
:host([theme="dark"]) {
${tokensToCss(prefix, dark)}
}
@media (prefers-color-scheme: dark) {
  :host([theme="auto"]),
  :host(:not([theme])) {
${tokensToCss(prefix, dark)}
  }
}
/* THEME-TOKENS-END */
`.trim();
}
//# sourceMappingURL=tokens.js.map