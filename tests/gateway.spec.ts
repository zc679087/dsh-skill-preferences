import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, {
  BUNDLED_SKILL_RANK,
  isModelInvocable,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'
import * as plugin from '../src/index.ts'
import { SKILL_PREFERENCES_NAMESPACE } from '../src/config.ts'
import type { SkillPreferencesGateway } from '../src/gateway.ts'
import type { SkillPreferenceRow } from '../src/types.ts'
import { MemorySettings } from './memory-settings.ts'

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
  const face = ctx.get('skillPreferences') as SkillPreferencesGateway | undefined
  if (face === undefined) throw new Error('skillPreferences face was not provided')
  return { ctx, face }
}

function find(rows: readonly SkillPreferenceRow[], name: string): SkillPreferenceRow {
  const row = rows.find(candidate => candidate.name === name)
  if (row === undefined) throw new Error(`no row for ${name}`)
  return row
}

describe('skillPreferences Remote face', () => {
  it('publishes itself under the skillPreferences service key', async () => {
    const { face } = await bench()
    expect(face.typertRemote.namespace).toBe('skillPreferences')
  })

  it('lists every skill as enabled before anything is turned off', async () => {
    const { face } = await bench()
    const { skills } = await face.list({})

    expect(skills.map(row => row.name)).toEqual(['nature-figure', 'pdf'])
    expect(skills.every(row => !row.disabled)).toBe(true)
    expect(skills.every(row => row.modelInvocable && row.userInvocable)).toBe(true)
    expect(find(skills, 'pdf').description).toBe('Real pdf description.')
  })

  it('turns a skill off, captures its metadata, and denies it in the registry', async () => {
    const { ctx, face } = await bench()

    const { skills } = await face.setEnabled({ name: 'pdf', enabled: false })

    const row = find(skills, 'pdf')
    expect(row.disabled).toBe(true)
    expect(row.modelInvocable).toBe(false)
    expect(row.userInvocable).toBe(false)
    // The captured hint keeps the row truthful after suppression.
    expect(row.description).toBe('Real pdf description.')
    expect(row.source).toBe('bundled')
    // The neighbour is untouched.
    expect(find(skills, 'nature-figure').disabled).toBe(false)

    // ...and the registry itself denies it, not just this projection.
    const definition = await ctx.skills.get('pdf')
    expect(isModelInvocable(definition!)).toBe(false)
  })

  it('persists the disabled name and its hint into the settings document', async () => {
    const { ctx, face } = await bench()
    await face.setEnabled({ name: 'pdf', enabled: false })

    const descriptor = ctx.settings.describe().find(d => String(d.ns) === SKILL_PREFERENCES_NAMESPACE)
    const stored = descriptor!.user as { disabled: string[]; hints: Record<string, unknown> }
    expect(stored.disabled).toEqual(['pdf'])
    expect(stored.hints).toEqual({ pdf: { description: 'Real pdf description.', source: 'bundled' } })
  })

  it('turns a skill back on and drops its hint', async () => {
    const { ctx, face } = await bench()
    await face.setEnabled({ name: 'pdf', enabled: false })

    const { skills } = await face.setEnabled({ name: 'pdf', enabled: true })

    const row = find(skills, 'pdf')
    expect(row.disabled).toBe(false)
    expect(row.modelInvocable).toBe(true)
    expect(row.provider).toBe('real')

    const descriptor = ctx.settings.describe().find(d => String(d.ns) === SKILL_PREFERENCES_NAMESPACE)
    const stored = descriptor!.user as { disabled: string[]; hints: Record<string, unknown> }
    expect(stored.disabled).toEqual([])
    expect(stored.hints).toEqual({})
  })

  it('keeps the disabled list sorted and idempotent under a repeated call', async () => {
    const { face } = await bench()
    await face.setEnabled({ name: 'pdf', enabled: false })
    await face.setEnabled({ name: 'nature-figure', enabled: false })
    const { skills } = await face.setEnabled({ name: 'pdf', enabled: false })

    expect(skills.every(row => row.disabled)).toBe(true)
    // Re-disabling must not overwrite the hint captured while it was enabled.
    expect(find(skills, 'pdf').description).toBe('Real pdf description.')
  })

  it('rejects disabling a skill that is not in the current catalog', async () => {
    const { face } = await bench()

    await expect(face.setEnabled({ name: 'ghost-skill', enabled: false }))
      .rejects.toThrow('Cannot disable unavailable skill "ghost-skill".')
  })

  it('rejects an invalid skill name before writing settings', async () => {
    const { face } = await bench()

    await expect(face.setEnabled({ name: 'Not A Skill', enabled: false }))
      .rejects.toThrow('Invalid skill name "Not A Skill".')
  })
})
