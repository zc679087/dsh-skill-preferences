/** In-memory settings provider: the smallest real subclass of the seam. */

import type { Context } from '@deepseek-ai/cordis'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'

/** Mount options, so a stored document can exist before the service loads. */
export interface MemorySettingsOptions {
  /** Raw document the provider "storage" already holds at mount time. */
  doc?: Record<string, unknown>
}

export class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown>
  readonly persisted: Array<{ ns: SettingsNamespace; section: Record<string, unknown> }> = []

  constructor(ctx: Context, options: MemorySettingsOptions = {}) {
    super(ctx)
    this.doc = structuredClone(options.doc ?? {})
  }

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.persisted.push({ ns, section: structuredClone(section) })
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}
