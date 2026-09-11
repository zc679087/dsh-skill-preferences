/**
 * Turn individual DSH skills off from user settings.
 *
 * This plugin owns the `skill-preferences` settings namespace and registers one
 * skill provider that suppresses every name the section lists. Suppression is
 * resolved inside `ctx.skills` itself (see `./provider.ts`), so the model-facing
 * catalog, the `skill` tool, and the user-explicit `/<name>` gesture all deny a
 * disabled skill without any of them knowing this plugin exists.
 *
 * Mount it exactly once, in the host composition: `ctx.settings.register()` is
 * not scope-layered and throws on a duplicate namespace, so mounting this per
 * agent preset fails on the second mount.
 *
 * @module dsh-skill-preferences
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Config, SKILL_PREFERENCES_NAMESPACE } from './config.ts'
import { createSuppressionProvider } from './provider.ts'
import { SkillPreferencesGateway } from './gateway.ts'
import { SkillPreferencesPolicy } from './policy.ts'

export { Config, SKILL_PREFERENCES_NAMESPACE } from './config.ts'
export { PROVIDER_NAME, SUPPRESSION_RANK, createSuppressionProvider } from './provider.ts'
export { SkillPreferencesGateway } from './gateway.ts'
export { POLICY_SERVICE, SkillPreferencesPolicy } from './policy.ts'
export type { ListInput, SetEnabledInput } from './gateway.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'skill-preferences'

/**
 * Required service. `settings` stays optional and is injected inside
 * {@link installSettingsSection}, so a composition without a settings provider
 * still loads this plugin and simply resolves its composition entry.
 */
export const inject = ['skills']

/**
 * Register the suppression provider and bind it to the settings section.
 * @param ctx - host plugin context carrying `ctx.skills`.
 * @param config - composition entry, used as the settings `base` layer.
 */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  // Only valid while the exact registration below is live; the registry drops
  // the call otherwise, so no guard is needed here.
  let invalidate: () => void = () => {}

  const policy = new SkillPreferencesPolicy(ctx, () => current())

  ctx.skills.registerProvider((control) => {
    invalidate = control.invalidate
    ctx.effect(() => policy.addInvalidator(control.invalidate), 'skill-preferences: invalidator')
    return createSuppressionProvider(() => current())
  })

  installSettingsSection(ctx, settingsNamespace(SKILL_PREFERENCES_NAMESPACE), Config, config, {
    setSource: (source) => {
      current = source
    },
    // Discovery reads the resolved section on every call, so a committed
    // change needs no re-registration — only a catalog invalidation, which
    // also emits `skills/change` for the consumers watching it.
    onChange: () => {
      // Every enforcing layer refreshes, not only the host's own: a preset row
      // registers its provider into that preset's layer.
      policy.notify()
      invalidate()
    },
  })

  // The face writes settings, so it exists exactly while a settings service
  // does. The Typert Gateway discovers it by reflection, so constructing it
  // is enough to publish the endpoints; a composition with no gateway
  // (headless, ACP) simply never dispatches to them.
  ctx.inject(['settings'], (sctx) => {
    new SkillPreferencesGateway(sctx, policy)
  })
}
