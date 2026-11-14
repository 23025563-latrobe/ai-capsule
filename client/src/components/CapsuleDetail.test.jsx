import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import CapsuleDetail from './CapsuleDetail'

const promptText = [
  'Keep this spacing.  ',
  'Second line with café and 東京.',
  '',
  '```js',
  'const label = "Save & review";',
  '```'
].join('\n')

const capsule = {
  project_name: 'Fictional project',
  prompt_title: 'Format a long prompt',
  prompt_version: 'v2',
  prompt_text: promptText,
  response_summary: '',
  notes: '',
  category: 'Coding',
  usefulness: '',
  reviewed: false,
  improved: false,
  screenshot_url: '',
  created_at: '2026-11-14T04:00:00.000Z'
}

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
)

function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value
  })
}

afterEach(() => {
  cleanup()
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    delete navigator.clipboard
  }
  vi.useRealTimers()
})

describe('capsule prompt detail', () => {
  it('copies the original multiline prompt exactly and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    render(
      <CapsuleDetail capsule={capsule} onEdit={vi.fn()} onDelete={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))

    expect(writeText).toHaveBeenCalledWith(promptText)
    expect(
      await screen.findByRole('status', { name: 'Prompt copy status' })
    ).toHaveTextContent('Prompt copied to clipboard.')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(document.querySelector('.prompt-copy').textContent).toBe(promptText)
  })

  it('restores the button label after the success feedback period', async () => {
    vi.useFakeTimers()
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })
    render(
      <CapsuleDetail capsule={capsule} onEdit={vi.fn()} onDelete={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800)
    })
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible()
  })

  it('shows accessible guidance when clipboard writing is rejected', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('Denied')) })
    render(
      <CapsuleDetail capsule={capsule} onEdit={vi.fn()} onDelete={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))

    expect(
      await screen.findByRole('status', { name: 'Prompt copy status' })
    ).toHaveTextContent(
      'Could not copy. Select the prompt text and copy it manually.'
    )
    expect(document.querySelector('.copy-error')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible()
  })

  it('shows the same guidance when clipboard access is unavailable', async () => {
    render(
      <CapsuleDetail capsule={capsule} onEdit={vi.fn()} onDelete={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))

    expect(
      await screen.findByRole('status', { name: 'Prompt copy status' })
    ).toHaveTextContent(
      'Could not copy. Select the prompt text and copy it manually.'
    )
  })

  it('clears copy feedback timers when the detail view unmounts', async () => {
    vi.useFakeTimers()
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })
    const { unmount } = render(
      <CapsuleDetail capsule={capsule} onEdit={vi.fn()} onDelete={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))
    await act(async () => {})
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
