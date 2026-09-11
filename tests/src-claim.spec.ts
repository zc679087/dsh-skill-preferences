/**
 * The load-bearing assumption of the whole zero-modification design: the Typert
 * Gateway discovers a live service carrying a `typertRemote` binding and claims
 * its `@Remote` methods as dispatchable `/api` endpoints, with no generated host
 * artifact and no edit to the gateway's own package.
 */

import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import SkillRegistry, {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'
import * as plugin from '../src/index.ts'
import { MemorySettings } from './memory-settings.ts'
import type { SkillPreferenceList } from '../src/types.ts'

type RpcResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly details: object } }

type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult>

/** Captures whatever the gateway installs on the `/api` channel. */
class FakeConnectionService extends Service {
  matches: ((endpoint: string) => boolean) | undefined
  handler: RpcHandler | undefined

  constructor(ctx: Context) {
    super(ctx, 'connection')
  }

  get rpc() {
    const owner = this.ctx
    return {
      intercept: (
        _channel: string,
        matches: (endpoint: string) => boolean,
        handler: RpcHandler,
      ) => owner.effect(() => {
        this.matches = matches
        this.handler = handler
        return () => {
          this.matches = undefined
          this.handler = undefined
        }
      }),
    }
  }
}

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
      locator: { content: `${name} body.` },
    }))),
    get: (candidate): Promise<SkillDefinition> => Promise.resolve({
      ...candidate,
      content: (candidate.locator as { content: string }).content,
    }),
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(TypertRegistry)
  const connection = new FakeConnectionService(ctx)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(SkillRegistry)
  ctx.skills.registerProvider(() => realProvider(['pdf', 'nature-figure']))
  await ctx.plugin(MemorySettings)
  await ctx.plugin(plugin, { disabled: [], hints: {} })
  return { ctx, connection }
}

describe('Typert SRC claim', () => {
  it('claims both face methods without a generated artifact', async () => {
    const { connection } = await bench()
    expect(connection.matches).toBeDefined()

    expect(connection.matches!('skillPreferences/list')).toBe(true)
    expect(connection.matches!('skillPreferences/setEnabled')).toBe(true)
  })

  it('does not claim endpoints the face does not export', async () => {
    const { connection } = await bench()

    expect(connection.matches!('skillPreferences/rows')).toBe(false)
    expect(connection.matches!('somethingElse/list')).toBe(false)
    expect(connection.matches!('skillPreferences')).toBe(false)
  })

  it('dispatches a real /api call through to the face', async () => {
    const { connection } = await bench()
    const controller = new AbortController()

    const result = await connection.handler!('skillPreferences/list', { args: { query: {} } }, controller.signal)

    expect(result.ok).toBe(true)
    const value = (result as { value: SkillPreferenceList }).value
    expect(value.skills.map(row => row.name)).toEqual(['nature-figure', 'pdf'])
    expect(value.skills.every(row => !row.disabled)).toBe(true)
  })

  it('dispatches a write and reflects it in the next read', async () => {
    const { ctx, connection } = await bench()
    const controller = new AbortController()

    const written = await connection.handler!(
      'skillPreferences/setEnabled',
      { args: { change: { name: 'pdf', enabled: false } } },
      controller.signal,
    )
    expect(written.ok).toBe(true)

    const read = await connection.handler!('skillPreferences/list', { args: { query: {} } }, controller.signal)
    const value = (read as { value: SkillPreferenceList }).value
    expect(value.skills.find(row => row.name === 'pdf')!.disabled).toBe(true)
    expect(value.skills.find(row => row.name === 'pdf')!.modelInvocable).toBe(false)

    // The registry agrees, so the write was enforcement and not bookkeeping.
    const definition = await ctx.skills.get('pdf')
    expect(definition!.invocation.modelInvocable).toBe(false)
  })

  it('stops claiming the endpoints once the plugin unloads', async () => {
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    const connection = new FakeConnectionService(ctx)
    await ctx.plugin(TypertGatewayService)
    await ctx.plugin(SkillRegistry)
    ctx.skills.registerProvider(() => realProvider(['pdf']))
    await ctx.plugin(MemorySettings)
    const fiber = await ctx.plugin(plugin, { disabled: [], hints: {} })
    expect(connection.matches!('skillPreferences/list')).toBe(true)

    await fiber.dispose()

    expect(connection.matches!('skillPreferences/list')).toBe(false)
  })
})
