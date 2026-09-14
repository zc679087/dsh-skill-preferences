import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillPreferenceList, SkillPreferenceRow } from '../types.ts'
import css from './SkillPreferencesTab.module.css'

/** Registration-side face the client plugin binds to the Remote namespace. */
export interface SkillPreferencesTabInjected {
  /** Read every skill with its current preference state. */
  list: () => Promise<SkillPreferenceList>
  /** Turn one skill on or off and read the table back. */
  setEnabled: (name: string, enabled: boolean) => Promise<SkillPreferenceList>
}

/** Full component props assembled by the Settings slot renderer. */
export type SkillPreferencesTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.skillPreferences'>
  & InjectFace<SkillPreferencesTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rows: readonly SkillPreferenceRow[] }

/** Whether a row matches the local search query. */
function matches(row: SkillPreferenceRow, query: string): boolean {
  if (query.length === 0) return true
  return [row.name, row.description, row.source]
    .some(value => value.toLocaleLowerCase().includes(query))
}

/** Render the skill on/off table. */
export function SkillPreferencesTab({ list, setEnabled, t }: SkillPreferencesTabProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (value) => { if (current) setState({ status: 'ready', rows: value.skills }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const toggle = useCallback((row: SkillPreferenceRow) => {
    setPending(row.name)
    setFailed(false)
    // The target state is the inverse of the current one, and a suppressed row
    // is exactly the one to turn back on.
    const nextEnabled = row.disabled
    void setEnabled(row.name, nextEnabled).then(
      (value) => {
        setState({ status: 'ready', rows: value.skills })
        setPending(null)
      },
      () => {
        // The host is the only authority on what landed, so a failed write
        // re-reads rather than rolling a local guess back.
        setFailed(true)
        setPending(null)
        setRequest(value => value + 1)
      },
    )
  }, [setEnabled])

  const normalized = query.trim().toLocaleLowerCase()
  const visible = useMemo(
    () => state.status === 'ready' ? state.rows.filter(row => matches(row, normalized)) : [],
    [normalized, state],
  )

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <>
          <p className={css.notice}>{t('nextTurnNotice')}</p>
          {failed ? <p className={css.status} role="alert">{t('saveFailed')}</p> : null}
          <label className={css.search}>
            <span className={css.visuallyHidden}>{t('search')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('search')}
              aria-label={t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
          <div className={css.heading}>
            <span aria-label={t('countLabel')} data-skill-count={visible.length}>{visible.length}</span>
          </div>
          {state.rows.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.rows.length > 0 && visible.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {visible.length > 0 ? (
            <ul className={css.rows}>
              {visible.map(row => (
                <li
                  className={css.row}
                  key={row.name}
                  data-skill={row.name}
                  data-disabled={row.disabled ? 'true' : 'false'}
                >
                  <span className={css.info}>
                    <span className={css.name}>{row.name}</span>
                    <span className={css.description}>{row.description}</span>
                    <span className={css.meta}>
                      <span>{`${t('source')}: ${row.source}`}</span>
                      <span>
                        {`${t('modelInvocation')}: ${row.modelInvocable ? t('allowed') : t('blocked')}`}
                      </span>
                      <span>
                        {`${t('userInvocation')}: ${row.userInvocable ? t('allowed') : t('blocked')}`}
                      </span>
                    </span>
                  </span>
                  <span className={css.controls}>
                    <span className={css.stateTag} data-enabled={row.disabled ? 'false' : 'true'}>
                      {row.disabled ? t('disabled') : t('enabled')}
                    </span>
                    <button
                      className={css.toggle}
                      type="button"
                      role="switch"
                      aria-checked={!row.disabled}
                      aria-label={t('toggleLabel').replace('{name}', row.name)}
                      disabled={pending !== null}
                      onClick={() => { toggle(row) }}
                    >
                      <span className={css.toggleThumb} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
