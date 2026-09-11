/**
 * The client half of the zero-modification claim: a hand-written Typert
 * contribution mounts through the real client gateway, so the browser reaches
 * this plugin's face without an entry in `@deepseek-ai/dsh-api-remotes`.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { apply, inject } from '@deepseek-ai/dsh-api-gateway/src/client/index.ts'
import { TYPERT_REMOTE } from '../src/remote.ts'
import type { SkillPreferenceList } from '../src/types.ts'

type RpcCall = (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<unknown>

interface RemoteFace {
  list: (query: { cwd?: string }) => Promise<{ ok: boolean; value?: SkillPreferenceList }>
  setEnabled: (change: { name: string; enabled: boolean }) => Promise<{ ok: boolean; value?: SkillPreferenceList }>
}

const ROWS: SkillPreferenceList = {
  skills: [
    {
      name: 'pdf',
      description: 'Real pdf description.',
      source: 'bundled',
      provider: 'real',
      disabled: false,
      modelInvocable: true,
      userInvocable: true,
    },
  ],
}

async function bench(call: RpcCall) {
  const ctx = new Context()
  await ctx.plugin(TypertRegistry)
  ctx.provide('connection', { rpc: { call } } as never)
  await ctx.plugin({ inject, apply })
  await ctx.plugin(Object.assign(
    (scope: Context) => (scope as never as { remote: { $mount: (c: unknown) => Promise<() => Promise<void>> } })
      .remote.$mount(TYPERT_REMOTE),
    { inject: ['remote'] },
  ))
  return ctx
}

function face(ctx: Context): RemoteFace {
  return (ctx as never as { remote: Record<string, RemoteFace> }).remote.skillPreferences
}

describe('hand-written Typert contribution', () => {
  it('mounts and exposes the namespace on ctx.remote', async () => {
    const ctx = await bench(vi.fn<RpcCall>().mockResolvedValue({ ok: true, value: ROWS }))

    expect(face(ctx)).toBeDefined()
    expect(typeof face(ctx).list).toBe('function')
    expect(typeof face(ctx).setEnabled).toBe('function')
  })

  it('sends args keyed by the host parameter names', async () => {
    const call = vi.fn<RpcCall>().mockResolvedValue({ ok: true, value: ROWS })
    const ctx = await bench(call)

    await face(ctx).list({})

    expect(call).toHaveBeenLastCalledWith(
      '/api',
      'skillPreferences/list',
      { args: { query: {} } },
      expect.anything(),
    )
  })

  it('sends a setEnabled change under its own parameter name', async () => {
    const call = vi.fn<RpcCall>().mockResolvedValue({ ok: true, value: ROWS })
    const ctx = await bench(call)

    await face(ctx).setEnabled({ name: 'pdf', enabled: false })

    expect(call).toHaveBeenLastCalledWith(
      '/api',
      'skillPreferences/setEnabled',
      { args: { change: { name: 'pdf', enabled: false } } },
      expect.anything(),
    )
  })

  it('decodes the response through the declared strict codec', async () => {
    const ctx = await bench(vi.fn<RpcCall>().mockResolvedValue({ ok: true, value: ROWS }))

    const result = await face(ctx).list({})

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(ROWS)
  })

  it('refuses a response the result schema does not accept', async () => {
    const ctx = await bench(vi.fn<RpcCall>().mockResolvedValue({
      ok: true,
      value: { skills: [{ name: 'pdf' }] },
    }))

    const result = await face(ctx).list({})

    expect(result.ok).toBe(false)
  })
})
