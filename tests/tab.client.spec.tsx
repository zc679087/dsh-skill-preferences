// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { SkillPreferencesTab, type SkillPreferencesTabInjected } from '../src/client/SkillPreferencesTab.tsx'
import type { SkillPreferenceList, SkillPreferenceRow } from '../src/types.ts'

// Testing Library's auto-cleanup only runs under a globals setup; without it a
// previous test's DOM stays in document.body and document-wide queries find
// stale nodes still closed over the previous test's doubles.
afterEach(cleanup)

/** Identity translator: the keys themselves are the assertions. */
const t = ((key: string) => key) as never

function row(name: string, disabled: boolean): SkillPreferenceRow {
  return {
    name,
    description: `Real ${name} description.`,
    source: 'bundled',
    provider: disabled ? 'skill-preferences' : 'real',
    disabled,
    modelInvocable: !disabled,
    userInvocable: !disabled,
  }
}

function table(...rows: SkillPreferenceRow[]): SkillPreferenceList {
  return { skills: rows }
}

function mount(face: SkillPreferencesTabInjected) {
  return render(
    <SkillPreferencesTab
      {...({ t } as never)}
      list={face.list}
      setEnabled={face.setEnabled}
    />,
  )
}

function toggleFor(name: string): HTMLElement {
  const item = document.querySelector(`[data-skill="${name}"]`)
  if (item === null) throw new Error(`no row rendered for ${name}`)
  const button = item.querySelector('button')
  if (button === null) throw new Error(`no toggle rendered for ${name}`)
  return button
}

describe('SkillPreferencesTab', () => {
  it('renders each skill with its invocation state', async () => {
    mount({
      list: () => Promise.resolve(table(row('pdf', false), row('hf-cli', true))),
      setEnabled: vi.fn(),
    })

    await screen.findByText('pdf')
    expect(document.querySelector('[data-skill="pdf"]')?.getAttribute('data-disabled')).toBe('false')
    expect(document.querySelector('[data-skill="hf-cli"]')?.getAttribute('data-disabled')).toBe('true')
    expect(toggleFor('pdf').getAttribute('aria-checked')).toBe('true')
    expect(toggleFor('hf-cli').getAttribute('aria-checked')).toBe('false')
    expect(toggleFor('pdf').textContent).toBe('')
    expect(document.querySelector('[data-skill="pdf"] [data-enabled="true"]')?.textContent).toBe('enabled')
    expect(document.querySelector('[data-skill="hf-cli"] [data-enabled="false"]')?.textContent).toBe('disabled')
  })

  it('turns a skill off through the face and renders what the host returned', async () => {
    const setEnabled = vi.fn<SkillPreferencesTabInjected['setEnabled']>()
      .mockResolvedValue(table(row('pdf', true)))
    mount({ list: () => Promise.resolve(table(row('pdf', false))), setEnabled })

    await screen.findByText('pdf')
    await act(async () => { toggleFor('pdf').click() })

    expect(setEnabled).toHaveBeenCalledWith('pdf', false)
    await waitFor(() => {
      expect(document.querySelector('[data-skill="pdf"]')?.getAttribute('data-disabled')).toBe('true')
    })
  })

  it('turns a disabled skill back on', async () => {
    const setEnabled = vi.fn<SkillPreferencesTabInjected['setEnabled']>()
      .mockResolvedValue(table(row('pdf', false)))
    mount({ list: () => Promise.resolve(table(row('pdf', true))), setEnabled })

    await screen.findByText('pdf')
    await act(async () => { toggleFor('pdf').click() })

    expect(setEnabled).toHaveBeenCalledWith('pdf', true)
  })

  it('re-reads from the host when a write fails instead of keeping a local guess', async () => {
    const list = vi.fn<SkillPreferencesTabInjected['list']>()
      .mockResolvedValue(table(row('pdf', false)))
    const setEnabled = vi.fn<SkillPreferencesTabInjected['setEnabled']>()
      .mockRejectedValue(new Error('settings-conflict'))
    mount({ list, setEnabled })

    await screen.findByText('pdf')
    expect(list).toHaveBeenCalledTimes(1)
    await act(async () => { toggleFor('pdf').click() })

    await screen.findByText('saveFailed')
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    // The row still shows the host's state, not the attempted one.
    expect(document.querySelector('[data-skill="pdf"]')?.getAttribute('data-disabled')).toBe('false')
  })

  it('offers a retry when the first read fails', async () => {
    const list = vi.fn<SkillPreferencesTabInjected['list']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(table(row('pdf', false)))
    mount({ list, setEnabled: vi.fn() })

    const retry = await screen.findByRole('button', { name: 'retry' })
    await act(async () => { retry.click() })

    await screen.findByText('pdf')
  })

  it('renders the configuration hint when no skills are discovered', async () => {
    mount({ list: () => Promise.resolve(table()), setEnabled: vi.fn() })

    await screen.findByText('empty')
  })

  it('filters rows by the search query', async () => {
    mount({
      list: () => Promise.resolve(table(row('pdf', false), row('hf-cli', false))),
      setEnabled: vi.fn(),
    })

    await screen.findByText('pdf')
    const search = screen.getByRole('searchbox')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(search, 'hf')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-skill="pdf"]')).toBeNull()
    })
    expect(document.querySelector('[data-skill="hf-cli"]')).not.toBeNull()
  })
})
