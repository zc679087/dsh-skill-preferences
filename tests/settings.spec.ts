import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
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
import { SKILL_PREFERENCES_NAMESPACE } from '../src/config.ts'
import { MemorySettings } from './memory-settings.ts'

const NS = settingsNamespace(SKILL_PREFERENCES_NAMESPACE)

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

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  ctx.skills.registerProvider(() => realProvider(['pdf', 'nature-figure']))
  await ctx.plugin(MemorySettings)
  await ctx.plugin(plugin, { disabled: [], hints: {} })
  return ctx
}

function row(skills: SkillSummary[], name: string): SkillSummary {
  const found = skills.find(skill => skill.name === name)
  if (found === undefined) throw new Error(`no row for ${name}`)
  return found
}

describe('skill-preferences settings integration', () => {
  it('applies a committed settings change and emits skills/change', async () => {
    const ctx = await bench()
    const onChange = vi.fn()
    ctx.on('skills/change', onChange)

    expect(isModelInvocable(row(await ctx.skills.list(), 'pdf'))).toBe(true)
    onChange.mockClear()

    await ctx.settings.update(NS, { disabled: ['pdf'] })

    expect(onChange).toHaveBeenCalledTimes(1)
    const denied = row(await ctx.skills.list(), 'pdf')
    expect(denied.provider).toBe('skill-preferences')
    expect(isModelInvocable(denied)).toBe(false)
    expect(isUserInvocable(denied)).toBe(false)
    expect(isModelInvocable(await ctx.skills.get('pdf') as SkillSummary)).toBe(false)
  })

  it('round-trips back to the real skill when re-enabled', async () => {
    const ctx = await bench()
    await ctx.settings.update(NS, { disabled: ['pdf'] })
    expect(isModelInvocable(row(await ctx.skills.list(), 'pdf'))).toBe(false)

    await ctx.settings.update(NS, { disabled: [] })

    const restored = row(await ctx.skills.list(), 'pdf')
    expect(restored.provider).toBe('real')
    expect(isModelInvocable(restored)).toBe(true)
    expect(restored.description).toBe('Real pdf description.')
  })

  it('renders a hint persisted alongside the disabled name', async () => {
    const ctx = await bench()

    await ctx.settings.update(NS, {
      disabled: ['pdf'],
      hints: { pdf: { description: 'Real pdf description.', source: 'bundled' } },
    })

    const disabled = row(await ctx.skills.list(), 'pdf')
    expect(disabled.description).toBe('Real pdf description.')
    expect(disabled.source).toBe('bundled')
    expect(isModelInvocable(disabled) || isUserInvocable(disabled)).toBe(false)
  })

  it('refuses a stale write instead of clobbering a concurrent change', async () => {
    const ctx = await bench()
    const before = ctx.settings.describe().find(d => String(d.ns) === SKILL_PREFERENCES_NAMESPACE)
    expect(before).toBeDefined()
    const stale = before!.revision

    await ctx.settings.update(NS, { disabled: ['pdf'] })

    await expect(ctx.settings.update(NS, { disabled: ['nature-figure'] }, stale)).rejects.toThrow()
    expect(isModelInvocable(row(await ctx.skills.list(), 'pdf'))).toBe(false)
    expect(isModelInvocable(row(await ctx.skills.list(), 'nature-figure'))).toBe(true)
  })

  it('reads the stored document at startup', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    ctx.skills.registerProvider(() => realProvider(['pdf', 'nature-figure']))
    await ctx.plugin(MemorySettings, {
      doc: {
        [SKILL_PREFERENCES_NAMESPACE]: {
          disabled: ['pdf'],
          hints: { pdf: { description: 'Real pdf description.', source: 'bundled' } },
        },
      },
    })
    await ctx.plugin(plugin, { disabled: [], hints: {} })

    const stored = row(await ctx.skills.list(), 'pdf')
    expect(isModelInvocable(stored)).toBe(false)
    expect(stored.description).toBe('Real pdf description.')
    expect(isModelInvocable(row(await ctx.skills.list(), 'nature-figure'))).toBe(true)
  })
})
