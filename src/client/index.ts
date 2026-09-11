/**
 * Browser half: the Skills tab in Web Settings.
 *
 * Two things make this work without any change to DSH. The Remote namespace is
 * mounted here from this package's own hand-written contribution rather than
 * from the `@deepseek-ai/dsh-api-remotes` selection, and the tab is contributed
 * through the public `settings.plugins.tab` slot. Both ride `ctx.effect`, so
 * unloading the plugin withdraws the namespace and the tab together.
 *
 * Every DSH import here is type-only on purpose: a client bundle may value-import
 * only platform modules, and cross-plugin collaboration goes through Cordis
 * services (`ctx.slots`, `ctx.locale`, `ctx.remote`).
 *
 * @module dsh-skill-preferences/client
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { TYPERT_REMOTE } from '../remote.ts'
import type { SkillPreferenceList } from '../types.ts'
import { SkillPreferencesTab, type SkillPreferencesTabInjected } from './SkillPreferencesTab.tsx'
import { en, zh, type SkillPreferencesLocaleKey } from './locales.ts'

export type { SkillPreferencesTabInjected, SkillPreferencesTabProps } from './SkillPreferencesTab.tsx'
export type { SkillPreferencesLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skill on/off table copy. */
    'settings.skillPreferences': SkillPreferencesLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skillPreferences'

/** Services required by the Settings registration and the mounted Remote face. */
export const inject = ['slots', 'locale', 'remote']

/** One Remote namespace call result, before its `ok` discriminant is checked. */
interface RemoteResult {
  readonly ok: boolean
  readonly value?: SkillPreferenceList
  readonly error?: { readonly code: string; readonly message: string }
}

/** The mounted namespace, typed locally because the contribution is this package's own. */
interface SkillPreferencesRemote {
  list: (query: { cwd?: string }) => Promise<RemoteResult>
  setEnabled: (change: { name: string; enabled: boolean }) => Promise<RemoteResult>
}

/** Unwrap a Remote result or throw, so the component's promise rejection is the only failure path. */
function unwrap(result: RemoteResult, endpoint: string): SkillPreferenceList {
  if (!result.ok || result.value === undefined) {
    const detail = result.error === undefined ? 'unknown error' : `${result.error.code}: ${result.error.message}`
    throw new Error(`${endpoint} failed: ${detail}`)
  }
  return result.value
}

/** Contribute the Skills tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-preferences: dictionaries')

  const remoteCtx = ctx as unknown as { remote: { $mount: (contribution: unknown) => Promise<() => Promise<void>> } }
  ctx.effect(
    () => remoteCtx.remote.$mount(TYPERT_REMOTE),
    'ui-skill-preferences: skillPreferences namespace',
  )

  const t = ctx.locale.bind(NS)
  const face = (): SkillPreferencesRemote => {
    // The namespace service is registered by `$mount` into the shared
    // `reflect` store, but its owning fiber is a sibling of this plugin's
    // fiber, so `ctx.remote.skillPreferences` cannot resolve it through the
    // fiber chain. Read it directly from the reflect store instead.
    const mounted = ctx.reflect.get('remote.skillPreferences') as SkillPreferencesRemote | undefined
    if (mounted === undefined) throw new Error('skillPreferences namespace is not mounted yet')
    return mounted
  }

  const injected = (): SkillPreferencesTabInjected => ({
    list: async () => unwrap(await face().list({}), 'skillPreferences/list'),
    setEnabled: async (name, enabled) =>
      unwrap(await face().setEnabled({ name, enabled }), 'skillPreferences/setEnabled'),
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'skills',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, SkillPreferencesTab))
}
