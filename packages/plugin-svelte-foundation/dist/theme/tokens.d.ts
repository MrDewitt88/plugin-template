export interface ThemeTokenSet {
    fg: string;
    bg: string;
    muted: string;
    accent: string;
    accentFg: string;
    kiara: string;
    kiaraFg: string;
    border: string;
    inputBg: string;
    cardBg: string;
    chipBg: string;
    infoBg: string;
    errorBg: string;
    errorFg: string;
    warnBg: string;
    warnFg: string;
}
/**
 * Standard light-theme token-werte. Plugin-Provider override-bar pro
 * Component falls Brand-Differentiation nötig.
 */
export declare const STANDARD_LIGHT: ThemeTokenSet;
/**
 * Standard dark-theme token-werte. Werte aus MarkView's
 * theme-attribute-Adoption übernommen (consistent cross-plugin look).
 */
export declare const STANDARD_DARK: ThemeTokenSet;
/**
 * Erzeugt CSS-Custom-Property-Block für `:host`-Selector.
 * Output:
 *   :host { --<prefix>-color-fg: #1a1a1a; --<prefix>-color-bg: ...; ... }
 *
 * Plugin-Component hängt das in seinen `<style>`-Block.
 */
export declare function tokensToCss(prefix: string, tokens: ThemeTokenSet): string;
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
export declare function buildThemeCss(prefix: string, light?: ThemeTokenSet, dark?: ThemeTokenSet): string;
//# sourceMappingURL=tokens.d.ts.map