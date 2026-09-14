/**
 * The suppression provider: how this plugin turns a skill off.
 *
 * A disabled skill is not filtered out of the registry — filtering at a
 * consumer is bypassable by any other caller of `ctx.skills.get()`. Instead
 * this provider registers a candidate for the disabled name at a rank that
 * wins every packaged rank in its layer, carrying an invocation policy that
 * denies both surfaces. The registry itself then resolves the name to a
 * denied entry, so `list()`, `snapshot()`, and `get()` all agree without any
 * consumer knowing this plugin exists.
 *
 * @module dsh-skill-preferences/provider
 */

import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
} from '@deepseek-ai/dsh-skill'
import type { Config } from './config.ts'

/**
 * Precedence for suppression candidates. Every packaged source ranks at 100 or
 * above (`project-dsh` is the lowest at 100, runtime registrations at 250,
 * bundled at 600), and lower ranks win duplicate names within a layer, so 0
 * outranks anything a provider can currently contribute. The registry requires
 * only a finite number here.
 */
export const SUPPRESSION_RANK = 0

/** Provider name; also the `source` reported for a name with no captured hint. */
export const PROVIDER_NAME = 'skill-preferences'

/** Denies both invocation surfaces. */
const DENIED = { modelInvocable: false, userInvocable: false } as const

/** Body served when a caller loads a suppressed skill through `ctx.skills.get()`. */
const SUPPRESSED_BODY = 'This skill is turned off in user settings and must not be used.'

/** Description shown for a name disabled before this plugin ever saw it enabled. */
const UNKNOWN_DESCRIPTION = 'Turned off in user settings.'

/**
 * Build the suppression provider over a live view of the resolved settings.
 * @param current - reads the currently resolved `skill-preferences` section; called on every discovery.
 * @returns the provider to hand to `ctx.skills.registerProvider()`.
 */
export function createSuppressionProvider(current: () => Config): SkillProvider {
  return {
    name: PROVIDER_NAME,
    list(_options: SkillLookupOptions): Promise<SkillCandidate[]> {
      const config = current()
      // Settings may have been edited by hand or written by an older release.
      // Keep one deterministic suppression candidate per name.
      const disabled = [...new Set(config.disabled)].sort()
      return Promise.resolve(disabled.map((name) => {
        const hint = config.hints[name]
        return {
          name,
          description: hint?.description === undefined || hint.description === ''
            ? UNKNOWN_DESCRIPTION
            : hint.description,
          invocation: DENIED,
          source: hint?.source === undefined || hint.source === '' ? PROVIDER_NAME : hint.source,
          provider: PROVIDER_NAME,
          rank: SUPPRESSION_RANK,
          locator: name,
        }
      }))
    },
    get(candidate: SkillCandidate): Promise<SkillDefinition> {
      return Promise.resolve({
        name: candidate.name,
        description: candidate.description,
        invocation: DENIED,
        source: candidate.source,
        provider: PROVIDER_NAME,
        content: SUPPRESSED_BODY,
      })
    },
  }
}
