/**
 * Where a globally mounted suppression provider does and does not reach.
 *
 * `SkillRegistry` merges the global layer first and then the viewing scope's
 * chain, and a nearer layer's same-name entry REPLACES the farther one
 * outright — rank only orders duplicates inside one layer. So a preset that
 * mounts its own `skill-filesystem` (which is exactly what the Web bundle
 * does, with the host row disabled) shadows a globally registered suppression
 * candidate no matter how low its rank is.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import SkillRegistry, {
  BUNDLED_SKILL_RANK,
  isModelInvocable,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'
import { MemorySettings } from './memory-settings.ts'
import * as plugin from '../src/index.ts'
import * as presetPlugin from '../src/preset.ts'

function presetProvider(names: string[]): SkillProvider {
  return {
    name: 'preset-filesystem',
    list: () => Promise.resolve(names.map<SkillCandidate>(name => ({
      name,
      description: `Real ${name} description.`,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'preset-filesystem',
      source: 'project-agents',
      rank: BUNDLED_SKILL_RANK,
      locator: { content: `${name} body.` },
    }))),
    get: (candidate): Promise<SkillDefinition> => Promise.resolve({
      ...candidate,
      content: (candidate.locator as { content: string }).content,
    }),
  }
}

describe('scope layering', () => {
  it('suppresses a skill that lives in the global layer', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    ctx.skills.registerProvider(() => presetProvider(['pdf']))
    await ctx.plugin(MemorySettings)
    await ctx.plugin(plugin, { disabled: ['pdf'], hints: {} })

    const rows = await ctx.skills.list()
    expect(isModelInvocable(rows.find(row => row.name === 'pdf')!)).toBe(false)
  })

  it('does not reach a preset scope from the host layer alone', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(plugin, { disabled: ['pdf'], hints: {} })

    // The Web bundle's shape: no host skill-filesystem, discovery inside the preset.
    // Scope keys are identity-compared, so the reader must hold the same object.
    const key = { preset: 'web' }
    const preset = createScope(ctx, key)
    const scoped = preset.ctx.get('skills') as SkillRegistry
    scoped.registerProvider(() => presetProvider(['pdf']))

    // Read as the agent reads: through its own scope.
    const scopedRows = await ctx.skills.list({ scope: key as never })
    const globalRows = await ctx.skills.list()

    // The global layer still shows the suppression...
    expect(isModelInvocable(globalRows.find(row => row.name === 'pdf')!)).toBe(false)
    // ...but the agent's own view is governed by the nearer layer.
    const asAgentSees = scopedRows.find(row => row.name === 'pdf')
    expect(asAgentSees).toBeDefined()
    expect(asAgentSees!.provider).toBe('preset-filesystem')
    expect(isModelInvocable(asAgentSees!)).toBe(true)

    await preset.dispose()
  })
})

describe('preset half', () => {
  it('suppresses a skill inside the preset scope that discovered it', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(plugin, { disabled: ['pdf'], hints: {} })

    const key = { preset: 'web' }
    const preset = createScope(ctx, key)
    const scoped = preset.ctx.get('skills') as SkillRegistry
    scoped.registerProvider(() => presetProvider(['pdf', 'nature-figure']))
    await preset.ctx.plugin(presetPlugin)

    const rows = await ctx.skills.list({ scope: key as never })
    const pdf = rows.find(row => row.name === 'pdf')

    expect(pdf).toBeDefined()
    expect(pdf!.provider).toBe('skill-preferences')
    expect(isModelInvocable(pdf!)).toBe(false)
    // The skill nobody disabled is untouched inside the same layer.
    expect(isModelInvocable(rows.find(row => row.name === 'nature-figure')!)).toBe(true)

    // ...and the agent's own loader agrees.
    const definition = await ctx.skills.get('pdf', { scope: key as never })
    expect(isModelInvocable(definition!)).toBe(false)

    await preset.dispose()
  })

  it('lets the settings face see the preset catalog it now governs', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(plugin, { disabled: [], hints: {} })

    const key = { preset: 'web' }
    const preset = createScope(ctx, key)
    const scoped = preset.ctx.get('skills') as SkillRegistry
    scoped.registerProvider(() => presetProvider(['pdf']))
    await preset.ctx.plugin(presetPlugin)

    const face = ctx.get('skillPreferences') as { list: (q: object) => Promise<{ skills: { name: string }[] }> }
    const { skills } = await face.list({})

    // The global layer is empty here, exactly as in the Web bundle.
    expect((await ctx.skills.list()).length).toBe(0)
    expect(skills.map(row => row.name)).toEqual(['pdf'])

    await preset.dispose()
  })
})
