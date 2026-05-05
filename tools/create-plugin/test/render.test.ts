import { describe, expect, it } from 'vitest'
import { buildContext, render } from '../src/templates/render.js'

describe('buildContext', () => {
  it('kebab → camel + pascal', () => {
    const ctx = buildContext({ pluginName: 'my-plugin', hosts: [], features: [] })
    expect(ctx.pluginName).toBe('my-plugin')
    expect(ctx.pluginNameCamel).toBe('myPlugin')
    expect(ctx.pluginNamePascal).toBe('MyPlugin')
  })

  it('single segment kebab', () => {
    const ctx = buildContext({ pluginName: 'kanban', hosts: [], features: [] })
    expect(ctx.pluginNameCamel).toBe('kanban')
    expect(ctx.pluginNamePascal).toBe('Kanban')
  })

  it('multi-segment kebab → multi-letter prefix', () => {
    const ctx = buildContext({
      pluginName: 'my-cool-plugin',
      hosts: [],
      features: [],
    })
    expect(ctx.pluginPrefix).toBe('mcp')
  })

  it('year ist current', () => {
    const ctx = buildContext({ pluginName: 'p', hosts: [], features: [] })
    expect(ctx.year).toBe(String(new Date().getFullYear()))
  })
})

describe('render — value-replacement', () => {
  const ctx = buildContext({
    pluginName: 'my-plugin',
    hosts: ['teammind', 'theseus'],
    features: ['mcp', 'bridge'],
  })

  it('{{pluginName}}', () => {
    expect(render('foo {{pluginName}} bar', ctx)).toBe('foo my-plugin bar')
  })

  it('{{pluginNameCamel}}', () => {
    expect(render('var {{pluginNameCamel}} = ...', ctx)).toBe('var myPlugin = ...')
  })

  it('{{pluginNamePascal}}', () => {
    expect(render('class {{pluginNamePascal}} {}', ctx)).toBe('class MyPlugin {}')
  })

  it('{{pluginPrefix}}', () => {
    expect(render('--{{pluginPrefix}}-color', ctx)).toBe('--mp-color')
  })

  it('{{hosts}} comma-separated', () => {
    expect(render('apps: [{{hosts}}]', ctx)).toBe('apps: [teammind, theseus]')
  })

  it('{{features}} comma-separated', () => {
    expect(render('x: {{features}}', ctx)).toBe('x: mcp, bridge')
  })

  it('multiple replacements', () => {
    expect(render('{{pluginName}}-{{pluginPrefix}}', ctx)).toBe('my-plugin-mp')
  })
})

describe('render — conditional sections', () => {
  it('{{#if features.storage}} included when feature present', () => {
    const ctx = buildContext({
      pluginName: 'p',
      hosts: [],
      features: ['storage', 'bridge'],
    })
    expect(render('{{#if features.storage}}YES{{/if}}', ctx)).toBe('YES')
  })

  it('{{#if features.storage}} stripped when feature absent', () => {
    const ctx = buildContext({ pluginName: 'p', hosts: [], features: ['mcp'] })
    expect(render('{{#if features.storage}}YES{{/if}}', ctx)).toBe('')
  })

  it('multi-line conditional', () => {
    const ctx = buildContext({ pluginName: 'p', hosts: [], features: ['svelte'] })
    expect(render('a\n{{#if features.svelte}}b\nc{{/if}}\nd', ctx)).toBe('a\nb\nc\nd')
  })

  it('value-replacement INSIDE conditional', () => {
    const ctx = buildContext({
      pluginName: 'my-plugin',
      hosts: [],
      features: ['storage'],
    })
    expect(render('{{#if features.storage}}{{pluginName}}-store{{/if}}', ctx)).toBe(
      'my-plugin-store',
    )
  })

  it('multiple conditionals don\'t interfere', () => {
    const ctx = buildContext({
      pluginName: 'p',
      hosts: [],
      features: ['storage', 'svelte'],
    })
    const tpl =
      '{{#if features.storage}}S{{/if}}-{{#if features.svelte}}V{{/if}}-{{#if features.mcp}}M{{/if}}'
    expect(render(tpl, ctx)).toBe('S-V-')
  })
})
