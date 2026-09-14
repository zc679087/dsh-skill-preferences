/**
 * Client-side Typert Remote contribution for the `skillPreferences` face.
 *
 * DSH generates this artifact for its own packages, but a contribution is
 * plain data: `ctx.remote.$mount()` accepts any well-formed descriptor list
 * whose results carry a strict codec. Hand-writing it is what keeps this
 * plugin out of the DSH build — nothing has to be added to
 * `@deepseek-ai/dsh-api-remotes`, whose mount list is that assembly's own
 * selection rather than the only way in.
 *
 * The host half is claimed in SRC mode, where the wire `args` keys are the
 * method's own parameter identifiers. Each `wire` below therefore MUST equal
 * the parameter name in `./gateway.ts` — `query` and `change`.
 *
 * @module dsh-skill-preferences/remote
 */

import { z } from 'zod'
import { SKILL_NAME_PATTERN } from './types.ts'

const rowSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.string(),
  provider: z.string(),
  disabled: z.boolean(),
  modelInvocable: z.boolean(),
  userInvocable: z.boolean(),
})

const listResultSchema = z.object({
  skills: z.array(rowSchema),
})

const querySchema = z.object({
  cwd: z.string().optional(),
})

const changeSchema = z.object({
  name: z.string().regex(SKILL_NAME_PATTERN),
  enabled: z.boolean(),
  cwd: z.string().optional(),
})

const PACKAGE = 'dsh-skill-preferences'
const NAMESPACE = 'skillPreferences'

/** The mountable contribution: `ctx.remote.$mount(TYPERT_REMOTE)`. */
export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    {
      id: `${PACKAGE}#${NAMESPACE}/list`,
      service: NAMESPACE,
      namespace: NAMESPACE,
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'query',
          wire: 'query',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: `${PACKAGE}/types#ListInput`,
            schema: querySchema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: `${PACKAGE}/types#SkillPreferenceList`,
        schema: listResultSchema,
      },
    },
    {
      id: `${PACKAGE}#${NAMESPACE}/setEnabled`,
      service: NAMESPACE,
      namespace: NAMESPACE,
      method: 'setEnabled',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'change',
          wire: 'change',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: `${PACKAGE}/types#SetEnabledInput`,
            schema: changeSchema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: `${PACKAGE}/types#SkillPreferenceList`,
        schema: listResultSchema,
      },
    },
  ],
}

export default TYPERT_REMOTE
