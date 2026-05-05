import { describe, expect, it } from 'vitest'
import {
  buildThemeCss,
  STANDARD_DARK,
  STANDARD_LIGHT,
  tokensToCss,
} from '../src/theme/tokens.js'

describe('tokensToCss', () => {
  it('emits CSS-Custom-Properties mit prefix', () => {
    const css = tokensToCss('mv', STANDARD_LIGHT)
    expect(css).toContain('--mv-color-fg: #1a1a1a')
    expect(css).toContain('--mv-color-bg: #ffffff')
    expect(css).toContain('--mv-color-error-fg: #991b1b')
  })

  it('camelCase → kebab-case conversion', () => {
    const css = tokensToCss('mv', STANDARD_LIGHT)
    expect(css).toContain('--mv-color-accent-fg')
    expect(css).toContain('--mv-color-input-bg')
    expect(css).toContain('--mv-color-card-bg')
  })

  it('unique prefix erlaubt — kanban-* statt mv-*', () => {
    const css = tokensToCss('kanban', STANDARD_LIGHT)
    expect(css).toContain('--kanban-color-fg')
    expect(css).not.toContain('--mv-')
  })

  it('alle 16 tokens emittiert', () => {
    const css = tokensToCss('mv', STANDARD_LIGHT)
    const lines = css.trim().split('\n').filter((l) => l.trim().length > 0)
    expect(lines.length).toBe(16)
  })
})

describe('buildThemeCss', () => {
  it('emits :host + :host([theme="dark"]) + @media auto-fallback', () => {
    const css = buildThemeCss('mv')
    expect(css).toContain(':host {')
    expect(css).toContain(':host([theme="dark"])')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':host([theme="auto"])')
    expect(css).toContain(':host(:not([theme]))')
  })

  it('inkludiert THEME-TOKENS-BEGIN/END markers für maintenance', () => {
    const css = buildThemeCss('mv')
    expect(css).toContain('THEME-TOKENS-BEGIN')
    expect(css).toContain('THEME-TOKENS-END')
  })

  it('custom light + dark tokens override-bar', () => {
    const customLight = { ...STANDARD_LIGHT, accent: '#ff0000' }
    const css = buildThemeCss('mv', customLight)
    expect(css).toContain('--mv-color-accent: #ff0000')
  })

  it('STANDARD_LIGHT + STANDARD_DARK haben identische Token-Keys', () => {
    expect(Object.keys(STANDARD_LIGHT).sort()).toEqual(Object.keys(STANDARD_DARK).sort())
  })
})
