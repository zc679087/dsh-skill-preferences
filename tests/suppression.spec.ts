import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, {
  BUNDLED_SKILL_RANK,
  isModelInvocable,
  isUserInvocable,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
  type SkillSummary,
} from '@deepseek-ai/dsh-skill'
import * as plugin from '../src/index.ts'
import type { Config } from '../src/config.ts'

/** Stands in for a packaged provider: bundled rank, both surfaces open. */
function realProvider(names: string[]): SkillProvider {
  return {
    name: 'real',
    list: () => Promise.resolve(names.map<SkillCandidate>(name => ({
      name,
      description: `Real ${name} description.`,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'real',
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      locator: { content: `${name} real body.` },
    }))),
    get: (candidate): Promise<SkillDefinition> => Promise.resolve({
      ...candidate,
      content: (candidate.locator as { content: string }).content,
    }),
  }
}

function entry(disabled: string[], hints: Config['hints'] = {}): Config {
  return { disabled, hints }
}

async function bench(config: Config) {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  ctx.skills.registerProvider(() => realProvider(['pdf', 'nature-figure']))
  await ctx.plugin(plugin, config)
  return ctx
}

function row(skills: SkillSummary[], name: string): SkillSummary {
  const found = skills.find(skill => skill.name === name)
  if (found === undefined) throw new Error(`no row for ${name}`)
  return found
}

describe('skill-preferences suppression', () => {
  it('leaves every skill invocable when nothing is disabled', async () => {
    const ctx = await bench(entry([]))
    const skills = await ctx.skills.list()

    expect(skills.map(skill => skill.name)).toEqual(['nature-figure', 'pdf'])
    expect(skills.every(skill => isModelInvocable(skill) && isUserInvocable(skill))).toBe(true)
    expect(skills.every(skill => skill.provider === 'real')).toBe(true)
  })

  it('denies both surfaces for a disabled skill through the registry itself', async () => {
    const ctx = await bench(entry(['pdf']))

    const summary = row(await ctx.skills.list(), 'pdf')
    expect(summary.provider).toBe('skill-preferences')
    expect(isModelInvocable(summary)).toBe(false)
    expect(isUserInvocable(summary)).toBe(false)

    // The load path is what a consumer bypassing the catalog would reach.
    const definition = await ctx.skills.get('pdf')
    expect(definition).toBeDefined()
    expect(isModelInvocable(definition!)).toBe(false)
    expect(isUserInvocable(definition!)).toBe(false)
    expect(definition!.content).not.toContain('real body')
  })

  it('leaves the skills it was not asked to disable untouched', async () => {
    const ctx = await bench(entry(['pdf']))
    const untouched = await ctx.skills.get('nature-figure')

    expect(isModelInvocable(untouched!)).toBe(true)
    expect(untouched!.content).toBe('nature-figure real body.')
  })

  it('renders a captured hint on the disabled row and falls back without one', async () => {
    const withHint = await bench(entry(['pdf'], {
      pdf: { description: 'Real pdf description.', source: 'bundled' },
    }))
    const hinted = row(await withHint.skills.list(), 'pdf')
    expect(hinted.description).toBe('Real pdf description.')
    expect(hinted.source).toBe('bundled')
    expect(isModelInvocable(hinted) || isUserInvocable(hinted)).toBe(false)

    const withoutHint = await bench(entry(['pdf']))
    const bare = row(await withoutHint.skills.list(), 'pdf')
    expect(bare.description).toBe('Turned off in user settings.')
    expect(isModelInvocable(bare) || isUserInvocable(bare)).toBe(false)
  })

  it('keeps a disabled name that matches no real skill inert and denied', async () => {
    const ctx = await bench(entry(['ghost-skill']))
    const ghost = row(await ctx.skills.list(), 'ghost-skill')

    expect(isModelInvocable(ghost) || isUserInvocable(ghost)).toBe(false)
    const definition = await ctx.skills.get('ghost-skill')
    expect(isModelInvocable(definition!) || isUserInvocable(definition!)).toBe(false)
  })

  it('restores the real skill when the plugin is unloaded', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    ctx.skills.registerProvider(() => realProvider(['pdf']))
    const fiber = await ctx.plugin(plugin, entry(['pdf']))
    expect(isModelInvocable(row(await ctx.skills.list(), 'pdf'))).toBe(false)

    await fiber.dispose()

    const restored = row(await ctx.skills.list(), 'pdf')
    expect(restored.provider).toBe('real')
    expect(isModelInvocable(restored)).toBe(true)
    expect(restored.description).toBe('Real pdf description.')
  })
})
