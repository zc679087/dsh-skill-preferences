/**
 * Remote face for the preferences UI.
 *
 * The Typert Gateway discovers a live service whose prototype carries a
 * `typertRemote` binding and claims its `@Remote` methods as dispatchable
 * endpoints, so this face reaches the browser as `skillPreferences/list` and
 * `skillPreferences/setEnabled` without a generated host artifact and without
 * any change to the API gateway.
 *
 * Reading the catalog here rather than through the skills RPC is deliberate:
 * that RPC requires a session and already filters to user-invocable skills, so
 * it can never show a settings page the rows it exists to edit.
 *
 * @module dsh-skill-preferences/gateway
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { isModelInvocable, isUserInvocable, type SkillSummary } from '@deepseek-ai/dsh-skill'
import { SKILL_PREFERENCES_NAMESPACE } from './config.ts'
import type { SkillPreferencesPolicy } from './policy.ts'
import { PROVIDER_NAME } from './provider.ts'
import type { CatalogHint, SkillPreferenceList, SkillPreferenceRow } from './types.ts'

/** Arguments accepted by `skillPreferences/setEnabled`. */
export interface SetEnabledInput {
  /** Kebab-case skill name to turn on or off. */
  readonly name: string
  /** Target state: `false` suppresses the skill. */
  readonly enabled: boolean
  /**
   * Workspace root whose project-level skills should be discovered, so a
   * project skill can be named in the same call that disables it. Omitted
   * reads the global catalog alone.
   */
  readonly cwd?: string
}

/** Arguments accepted by `skillPreferences/list`. */
export interface ListInput {
  /** Workspace root for project-level discovery; omitted reads the global catalog. */
  readonly cwd?: string
}

/** Remote-only service backing the Skills settings page. */
export class SkillPreferencesGateway extends TypertRemoteService {

  // TypeScript-private, not a # field: Cordis hands consumers a Proxy over the
  // service, and an ECMAScript private field is unreachable through one.
  private readonly handle: SkillPreferencesPolicy

  /**
   * Bind the face to the plugin's resolved settings.
   *
   * The context MUST already inject both `skills` and `settings`: a Service
   * created with `new` borrows its caller's inject list, and a class-level
   * `static inject` is only honoured when Cordis mounts the class itself.
   * @param ctx - owning context injecting `skills` and `settings`.
   * @param handle - the shared policy service: resolved section plus enforcing scopes.
   */
  constructor(ctx: Context, handle: SkillPreferencesPolicy) {
    super(ctx, 'skillPreferences')
    this.handle = handle
  }

  /**
   * Read every known skill with its current preference state.
   * @param query - workspace root for project-level discovery; pass {} for the global catalog.
   * @returns rows sorted by skill name.
   */
  @Remote
  async list(query: ListInput): Promise<SkillPreferenceList> {
    return { skills: await this.rows(query.cwd) }
  }

  /**
   * Turn one skill on or off and return the table as it now stands.
   *
   * Disabling captures the skill's real description and source in the same
   * write, because after suppression the registry no longer resolves them.
   * @param change - the skill name and its target state.
   * @returns rows sorted by skill name, after the change committed.
   */
  @Remote
  async setEnabled(change: SetEnabledInput): Promise<SkillPreferenceList> {
    const config = this.handle.current()
    const disabled = new Set(config.disabled)
    const hints: Record<string, CatalogHint> = { ...config.hints }

    if (change.enabled) {
      disabled.delete(change.name)
      delete hints[change.name]
    } else {
      // Read before writing: while the skill is still enabled its real
      // metadata is reachable, and after suppression it is not.
      const summary = (await this.rows(change.cwd)).find(row => row.name === change.name)
      if (summary !== undefined && !summary.disabled) {
        hints[change.name] = { description: summary.description, source: summary.source }
      }
      disabled.add(change.name)
    }

    // replace, not update: a merge patch can add a hint but can never drop
    // one, so re-enabling a skill would leave its captured metadata behind.
    await this.ctx.settings.replace(settingsNamespace(SKILL_PREFERENCES_NAMESPACE), {
      disabled: [...disabled].sort(),
      hints,
    })
    return { skills: await this.rows(change.cwd) }
  }

  /** Project the registry catalog onto preference rows. */
  private async rows(cwd: string | undefined): Promise<SkillPreferenceRow[]> {
    const disabled = new Set(this.handle.current().disabled)
    const lookup = cwd === undefined ? {} : { cwd }
    // The global layer alone is not the catalog a user sees. A composition
    // may disable the host `skill-filesystem` row and discover skills inside
    // agent presets instead (the Web bundle does), so every scope that mounted
    // the preset half is read too and merged by name.
    const byName = new Map<string, SkillSummary>()
    for (const summary of await this.ctx.skills.list(lookup)) byName.set(summary.name, summary)
    for (const scope of this.handle.enforcingScopes()) {
      for (const summary of await this.ctx.skills.list({ ...lookup, scope })) byName.set(summary.name, summary)
    }
    const summaries = [...byName.values()].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    return summaries.map(summary => ({
      name: summary.name,
      description: summary.description,
      source: summary.source,
      provider: summary.provider,
      disabled: disabled.has(summary.name) || summary.provider === PROVIDER_NAME,
      modelInvocable: isModelInvocable(summary),
      userInvocable: isUserInvocable(summary),
    }))
  }

}
