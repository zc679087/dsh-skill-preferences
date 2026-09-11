/**
 * Settings schema for the `skill-preferences` namespace.
 *
 * @module dsh-skill-preferences/config
 */

import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import type { CatalogHint } from './types.ts'

/** The resolved `skill-preferences` settings section. */
export interface Config {
  /**
   * Skill names the user has turned off. This list is the only authority for
   * enforcement; a name that matches no discovered skill stays inert.
   */
  readonly disabled: string[]
  /**
   * Display metadata captured when each name was disabled, keyed by skill
   * name. Purely cosmetic — see {@link CatalogHint}.
   */
  readonly hints: Record<string, CatalogHint>
}

/** Schema for one captured display hint. */
const hint: Schema<CatalogHint> = z.object({
  description: z.string().default(''),
  source: z.string().default(''),
})

/** Schema resolving the `skill-preferences` settings section. */
export const Config: Schema<Config> = z.object({
  disabled: z.array(z.string()).default([]),
  hints: z.dict(hint).default({}),
})

/** The settings namespace this plugin owns. */
export const SKILL_PREFERENCES_NAMESPACE = 'skill-preferences'
