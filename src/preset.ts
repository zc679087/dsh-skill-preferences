/**
 * Preset-mountable half: enforcement inside one agent preset's scope layer.
 *
 * `SkillRegistry` merges the global layer first and then the viewing scope's
 * chain, and a nearer layer's same-name entry REPLACES the farther one — rank
 * only orders duplicates within a layer. A composition that discovers skills
 * inside presets (the Web bundle disables the host `skill-filesystem` row and
 * does exactly that) therefore shadows a globally registered suppression
 * candidate, whatever its rank. Mount this row wherever `skill-filesystem`
 * is mounted, and the suppression lands in the same layer it has to win.
 *
 * It owns no settings: the host row publishes the policy service this reads.
 *
 * @module dsh-skill-preferences/preset
 */

import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { createSuppressionProvider } from './provider.ts'
import { POLICY_SERVICE } from './policy.ts'

/** Cordis plugin name. */
export const name = 'skill-preferences-preset'

/** Required services: the registry to register into, and the host's resolved policy. */
export const inject = ['skills', POLICY_SERVICE]

/**
 * Register the suppression provider into the calling context's scope layer.
 * @param ctx - preset plugin context; its scope decides which layer this lands in.
 */
export function apply(ctx: Context): void {
  const policy = ctx.skillPreferencesPolicy

  ctx.skills.registerProvider((control) => {
    ctx.effect(() => policy.addInvalidator(control.invalidate), 'skill-preferences-preset: invalidator')
    return createSuppressionProvider(() => policy.current())
  })

  const key = scopeOf(ctx)
  // An unscoped mount is the host layer, which the host row already covers.
  if (key !== undefined) {
    ctx.effect(() => policy.addScope(key), 'skill-preferences-preset: scope')
  }
}
