/**
 * Client-safe vocabulary for the skill-preferences plugin. This module imports
 * nothing from the Host plane so a browser bundle can name what it sends and
 * receives without pulling a Host package into the client graph.
 *
 * @module dsh-skill-preferences/types
 */

/**
 * Display metadata captured at the moment a skill was disabled.
 *
 * A disabled skill is shadowed inside the registry, so its real description is
 * no longer reachable through `ctx.skills`. The hint preserves what the row
 * looked like while it was still enabled purely so a settings page can render
 * a truthful row; nothing in enforcement reads it, and deleting the whole
 * `hints` section only degrades display.
 */
export interface CatalogHint {
  /** The skill's routing description as it read when the skill was disabled. */
  readonly description: string
  /** The discovery source that owned the skill when it was disabled. */
  readonly source: string
}

/** One skill as the preferences UI presents it. */
export interface SkillPreferenceRow {
  /** Kebab-case skill name. */
  readonly name: string
  /** Routing description; for a disabled skill this is the captured hint. */
  readonly description: string
  /** Discovery source bucket. */
  readonly source: string
  /** Provider that currently owns the winning entry for this name. */
  readonly provider: string
  /** Whether this plugin is currently suppressing the skill. */
  readonly disabled: boolean
  /** Resolved model-invocation state, after this plugin's suppression. */
  readonly modelInvocable: boolean
  /** Resolved user-invocation state, after this plugin's suppression. */
  readonly userInvocable: boolean
}

/** The preferences table as one response. */
export interface SkillPreferenceList {
  /** Rows sorted by skill name. */
  readonly skills: readonly SkillPreferenceRow[]
}
