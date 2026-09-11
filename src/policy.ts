/**
 * The shared policy service both halves of this plugin read.
 *
 * The host half owns the settings section; a preset half registers the same
 * suppression provider into its own scope layer. They must agree on one
 * resolved policy and invalidate together, and a preset-mounted plugin cannot
 * own the settings namespace itself — `ctx.settings.register()` is not
 * scope-layered and throws on a duplicate. So the host publishes this service
 * and every registration borrows from it.
 *
 * @module dsh-skill-preferences/policy
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { Config } from './config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillPreferencesPolicy: SkillPreferencesPolicy
  }
}

/** Service key the preset half injects. */
export const POLICY_SERVICE = 'skillPreferencesPolicy'

/** Resolved on/off policy plus the scopes that enforce it. */
export class SkillPreferencesPolicy extends Service {
  private source: () => Config
  private readonly invalidators = new Set<() => void>()
  private readonly scopes = new Set<ScopeKey>()

  /**
   * Publish the policy service.
   * @param ctx - host context owning the settings section.
   * @param source - reads the currently resolved section.
   */
  constructor(ctx: Context, source: () => Config) {
    super(ctx, POLICY_SERVICE)
    this.source = source
  }

  /**
   * Point the service at a new resolved-section reader.
   * @param source - reads the currently resolved section.
   */
  setSource(source: () => Config): void {
    this.source = source
  }

  /**
   * Read the resolved section.
   * @returns the current disabled list and captured hints.
   */
  current(): Config {
    return this.source()
  }

  /**
   * Register one catalog invalidator, so a committed settings change refreshes
   * every layer that enforces the policy, not only the host's own.
   * @param invalidate - the registration's own `SkillProviderControl.invalidate`.
   * @returns the disposer removing it.
   */
  addInvalidator(invalidate: () => void): () => void {
    this.invalidators.add(invalidate)
    return () => { this.invalidators.delete(invalidate) }
  }

  /**
   * Announce that a scope enforces this policy, so the settings face can read
   * the catalog those agents actually see. The Web bundle disables the host
   * `skill-filesystem` row and discovers skills inside presets, so without
   * this the face would read an empty global layer.
   * @param key - the registering context's scope.
   * @returns the disposer removing it.
   */
  addScope(key: ScopeKey): () => void {
    this.scopes.add(key)
    return () => { this.scopes.delete(key) }
  }

  /**
   * Every scope currently enforcing this policy.
   * @returns the registered scope keys, in registration order.
   */
  enforcingScopes(): ScopeKey[] {
    return [...this.scopes]
  }

  /** Invalidate every enforcing layer's catalog after a committed change. */
  notify(): void {
    for (const invalidate of this.invalidators) invalidate()
  }
}

export default SkillPreferencesPolicy
