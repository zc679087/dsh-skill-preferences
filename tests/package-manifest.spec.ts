import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  readonly exports?: Record<string, unknown>
  readonly dsh?: {
    readonly client?: {
      readonly platform?: string
      readonly inject?: unknown[]
    }
  }
}

describe('package manifest', () => {
  it('declares the exported browser entry as a DSH web client', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest

    expect(manifest.exports?.['./client']).toBeDefined()
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.dsh?.client?.inject).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-api-remotes',
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-locale',
    ]))
  })
})
