import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CapsuleWorkspace from './CapsuleWorkspace'
import App from '../App'
import { apiRequest } from '../api'

const example = {
  id: 7,
  project_name: 'Fictional Coastal Library',
  prompt_title: 'Compare catalogue layouts',
  prompt_version: '2',
  prompt_text:
    'Suggest two accessible layouts for a fictional library catalogue.',
  response_summary: 'A simple list makes the reading order clearer.',
  category: 'Accessibility',
  usefulness: 'Useful starting point',
  reviewed: false,
  improved: false,
  screenshot_url: 'https://example.com/fictional-layout.png',
  notes: 'Fictional test record. Check focus order.',
  created_at: '2026-11-14T04:00:00.000Z',
  user_id: '101'
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status })
const capsuleRecord = (id, updates = {}) => ({ ...example, id, ...updates })

function start(records = []) {
  const fetch = vi.fn().mockResolvedValueOnce(json({ capsules: records }))
  vi.stubGlobal('fetch', fetch)
  const onSessionExpired = vi.fn()
  render(<CapsuleWorkspace onSessionExpired={onSessionExpired} />)
  return { fetch, onSessionExpired, user: userEvent.setup() }
}

async function openExample(user) {
  await user.click(
    await screen.findByRole('button', { name: /Compare catalogue layouts/ })
  )
}

async function fillRequired(user) {
  await user.type(
    screen.getByLabelText(/Project name/),
    'Fictional Coastal Library'
  )
  await user.type(
    screen.getByLabelText(/Prompt title/),
    'Draft a reading guide'
  )
  await user.type(
    screen.getByLabelText(/Prompt text/),
    'Suggest a reading guide for a fictional book club.'
  )
}

describe('capsule workspace', () => {
  it('announces loading before showing an empty collection', async () => {
    let resolve
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    )
    render(<CapsuleWorkspace onSessionExpired={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your capsules'
    )
    expect(screen.queryByText('0 matches')).not.toBeInTheDocument()
    resolve(json({ capsules: [] }))
    expect(await screen.findByText('No capsules yet')).toBeVisible()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByText('0 matches')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create your first capsule' })
    ).toBeEnabled()
  })

  it('labels review badges as review status in the list', async () => {
    start([example])
    expect(
      await screen.findByRole('columnheader', { name: 'Review status' })
    ).toBeVisible()
    const reviewedBadge = screen
      .getAllByText('Not reviewed')
      .find((element) => element.classList.contains('badge'))
    expect(reviewedBadge.closest('td')).toHaveAttribute(
      'data-label',
      'Review status'
    )
    expect(
      screen.queryByRole('columnheader', { name: 'Reflection' })
    ).toBeNull()
    const titleButton = screen.getByRole('button', {
      name: example.prompt_title
    })
    expect(titleButton.querySelector('span')).toHaveTextContent('›')
    expect(titleButton.querySelector('span')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('shows category and version values in labelled metadata badges', async () => {
    start([example])
    await screen.findByRole('button', { name: example.prompt_title })

    expect(screen.getByText('Version 2')).toHaveClass(
      'metadata-badge',
      'version-badge'
    )
    expect(
      screen
        .getAllByText('Accessibility')
        .find((element) => element.classList.contains('category-badge'))
    ).toHaveClass('metadata-badge', 'category-badge')
  })

  it.each([
    ['prompt title', 'prompt_title'],
    ['project name', 'project_name'],
    ['prompt text', 'prompt_text'],
    ['response summary', 'response_summary'],
    ['category', 'category'],
    ['notes', 'notes']
  ])('searches %s without regard to case', async (_label, field) => {
    const matching = capsuleRecord(11, {
      [field]: `AURORA match ${field}`
    })
    const other = capsuleRecord(12, { prompt_title: 'A separate record' })
    const { user } = start([matching, other])
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search capsules' }),
      'aurora MATCH'
    )

    expect(
      await screen.findByRole('button', { name: matching.prompt_title })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: other.prompt_title })
    ).not.toBeInTheDocument()
  })

  it('searches records safely when optional text fields are empty', async () => {
    const record = capsuleRecord(13, {
      prompt_title: 'A record with empty optional fields',
      response_summary: '',
      category: '',
      notes: ''
    })
    const { user } = start([record])
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search capsules' }),
      'empty optional'
    )

    expect(
      await screen.findByRole('button', { name: record.prompt_title })
    ).toBeVisible()
  })

  it('combines search, custom category, usefulness and reviewed status', async () => {
    const records = [
      capsuleRecord(21, {
        prompt_title: 'Winter survey summary',
        category: 'Data analysis',
        usefulness: 'Good',
        reviewed: true,
        improved: false
      }),
      capsuleRecord(22, {
        prompt_title: 'Winter survey draft',
        category: 'Data analysis',
        usefulness: 'Good',
        reviewed: false,
        improved: true
      }),
      capsuleRecord(23, {
        prompt_title: 'Winter survey revision',
        category: 'Data analysis',
        usefulness: 'Needs improvement',
        reviewed: true,
        improved: true
      })
    ]
    const { user } = start(records)
    await screen.findByRole('button', { name: records[0].prompt_title })
    const search = screen.getByRole('searchbox', { name: 'Search capsules' })
    await user.type(search, 'winter survey')
    await user.selectOptions(
      screen.getByLabelText('Category'),
      'category:data analysis'
    )
    await user.selectOptions(screen.getByLabelText('Usefulness'), 'value:Good')
    await user.selectOptions(screen.getByLabelText('Review status'), 'reviewed')
    expect(
      within(screen.getByLabelText('Category')).getByRole('option', {
        name: 'Data analysis'
      })
    ).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Category')).queryByRole('option', {
        name: 'Coding'
      })
    ).toBeNull()

    expect(
      screen.getByRole('button', { name: records[0].prompt_title })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: records[1].prompt_title })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: records[2].prompt_title })
    ).not.toBeInTheDocument()
    expect(screen.getByText('1 match')).toBeVisible()

    await user.selectOptions(
      screen.getByLabelText('Review status'),
      'not-reviewed'
    )
    expect(
      screen.queryByRole('button', { name: records[0].prompt_title })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: records[1].prompt_title })
    ).toBeVisible()
  })

  it('filters not-rated records and keeps legacy usefulness options', async () => {
    const notRated = capsuleRecord(31, {
      prompt_title: 'Unrated response',
      usefulness: ''
    })
    const legacy = capsuleRecord(32, {
      prompt_title: 'Legacy usefulness value',
      usefulness: 'Useful after review'
    })
    const { user } = start([notRated, legacy])
    await screen.findByRole('searchbox', { name: 'Search capsules' })
    const usefulness = screen.getByLabelText('Usefulness')
    expect(
      within(usefulness).getByRole('option', { name: 'Useful after review' })
    ).toBeInTheDocument()
    await user.selectOptions(usefulness, 'value:')

    expect(
      await screen.findByRole('button', { name: notRated.prompt_title })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: legacy.prompt_title })
    ).not.toBeInTheDocument()
  })

  it('can filter uncategorised records without hiding saved categories', async () => {
    const uncategorised = capsuleRecord(35, {
      prompt_title: 'Uncategorised example',
      category: ''
    })
    const categorised = capsuleRecord(36, {
      prompt_title: 'Categorised example',
      category: 'Field notes'
    })
    const { user } = start([uncategorised, categorised])
    await screen.findByRole('button', { name: uncategorised.prompt_title })
    const category = screen.getByLabelText('Category')
    expect(
      within(category).getByRole('option', { name: 'Uncategorised' })
    ).toBeInTheDocument()
    await user.selectOptions(category, 'uncategorised')

    expect(
      screen.getByRole('button', { name: uncategorised.prompt_title })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: categorised.prompt_title })
    ).not.toBeInTheDocument()
  })

  it('offers a one-step reset while filtered results remain', async () => {
    const second = capsuleRecord(43, {
      prompt_title: 'A second catalogue capsule'
    })
    const { user } = start([example, second])
    await screen.findByRole('button', { name: example.prompt_title })
    const category = screen.getByLabelText('Category')
    await user.selectOptions(category, 'category:accessibility')
    await user.type(
      screen.getByRole('searchbox', { name: 'Search capsules' }),
      'catalogue'
    )
    await user.click(
      screen.getByRole('button', { name: 'Clear search and filters' })
    )

    expect(category).toHaveValue('all')
    expect(
      screen.getByRole('searchbox', { name: 'Search capsules' })
    ).toHaveValue('')
    expect(
      screen.getByRole('button', { name: second.prompt_title })
    ).toBeVisible()
  })

  it('clears search and filters from the no-matches state', async () => {
    const { user } = start([
      example,
      capsuleRecord(42, { prompt_title: 'A second capsule' })
    ])
    await screen.findByRole('button', { name: example.prompt_title })
    await user.selectOptions(
      screen.getByLabelText('Category'),
      'category:accessibility'
    )
    await user.selectOptions(
      screen.getByLabelText('Usefulness'),
      'value:Useful starting point'
    )
    await user.selectOptions(
      screen.getByLabelText('Review status'),
      'not-reviewed'
    )
    await user.type(
      screen.getByRole('searchbox', { name: 'Search capsules' }),
      'nothing matches'
    )

    expect(
      await screen.findByRole('heading', {
        name: 'No capsules match your search and filters.'
      })
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Clear search and filters' })
    )

    expect(
      await screen.findByRole('button', { name: example.prompt_title })
    ).toBeVisible()
    expect(
      screen.getByRole('searchbox', { name: 'Search capsules' })
    ).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('all')
    expect(screen.getByLabelText('Usefulness')).toHaveValue('all')
    expect(screen.getByLabelText('Review status')).toHaveValue('all')
  })

  it('clears only the search text with its clear button', async () => {
    const { user } = start([example])
    const search = await screen.findByRole('searchbox', {
      name: 'Search capsules'
    })
    await user.type(search, 'catalogue')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(search).toHaveValue('')
    expect(
      await screen.findByRole('button', { name: example.prompt_title })
    ).toBeVisible()
  })

  it('shows a recoverable loading failure and retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'Temporarily unavailable.' }, 500))
      .mockResolvedValueOnce(json({ capsules: [example] }))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<CapsuleWorkspace onSessionExpired={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporarily unavailable.'
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: /Compare catalogue layouts/ })
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('suggests loaded categories once, with trimming and case-insensitive deduplication', async () => {
    const records = [
      ' Coding ',
      'coding',
      '  Field Notes  ',
      'FIELD NOTES',
      '  '
    ].map((category, index) => ({
      ...example,
      id: index + 1,
      category
    }))
    const { user, fetch } = start(records)
    await user.click(await screen.findByRole('button', { name: /New capsule/ }))
    const input = screen.getByLabelText(/^Category/)
    const list = document.getElementById(input.getAttribute('list'))
    expect([...list.options].map((option) => option.value)).toEqual([
      'Coding',
      'Writing',
      'Research',
      'Study',
      'Planning',
      'Other',
      'Field Notes'
    ])
    await fillRequired(user)
    await user.type(input, 'Field Notes')
    fetch.mockImplementationOnce(async (path, options) => {
      expect(path).toBe('/api/capsules')
      return json({ capsule: { ...example, ...JSON.parse(options.body) } }, 201)
    })
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', { name: 'Draft a reading guide' })
    ).toBeVisible()
    expect(JSON.parse(fetch.mock.calls[1][1].body).category).toBe('Field Notes')
  })

  it('creates a capsule, prevents duplicate saving and displays the saved record', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    let resolveSave
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /All capsules/ })).toBeDisabled()
    const [path, options] = fetch.mock.calls[1]
    expect(path).toBe('/api/capsules')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      project_name: 'Fictional Coastal Library',
      prompt_title: 'Draft a reading guide',
      prompt_version: 'v1',
      category: '',
      prompt_text: 'Suggest a reading guide for a fictional book club.',
      response_summary: '',
      usefulness: '',
      screenshot_url: '',
      notes: '',
      reviewed: false,
      improved: false
    })
    resolveSave(
      json({ capsule: { ...example, ...JSON.parse(options.body) } }, 201)
    )
    expect(
      await screen.findByRole('heading', { name: 'Draft a reading guide' })
    ).toBeVisible()
    expect(
      screen.getByText('Capsule saved.', { selector: '[role="status"]' })
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps input and focuses the field when the server rejects a save', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    fetch.mockResolvedValueOnce(
      json(
        {
          error: 'Invalid capsule.',
          details: [
            { field: 'prompt_title', message: 'Please choose a clearer title.' }
          ]
        },
        400
      )
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your changes have not been saved'
    )
    expect(screen.getByText('Please choose a clearer title.')).toBeVisible()
    expect(screen.getByLabelText(/Prompt title/)).toHaveValue(
      'Draft a reading guide'
    )
    expect(screen.getByLabelText(/Prompt text/)).toHaveValue(
      'Suggest a reading guide for a fictional book club.'
    )
    expect(screen.getByLabelText(/Prompt title/)).toHaveFocus()
    expect(screen.getByLabelText(/Prompt title/)).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('keeps form values after a network failure', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    await user.type(
      screen.getByLabelText(/^Notes/),
      'Fictional verification note'
    )
    fetch.mockRejectedValueOnce(new TypeError('Network unavailable'))
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach AI Capsule'
    )
    expect(screen.getByLabelText(/^Notes/)).toHaveValue(
      'Fictional verification note'
    )
    expect(screen.getByRole('button', { name: 'Save capsule' })).toBeEnabled()
  })

  it('validates evidence URLs and nonblank text before sending a request', async () => {
    const { fetch, user } = start()
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    await user.clear(screen.getByLabelText(/Prompt title/))
    await user.type(screen.getByLabelText(/Prompt title/), '   ')
    await user.type(
      screen.getByLabelText(/^Screenshot evidence URL/),
      'javascript:alert(1)'
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(screen.getByText('Enter a nonblank value.')).toBeVisible()
    expect(
      screen.getByText('Use a full HTTP or HTTPS URL without credentials.')
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
    await user.type(
      screen.getByLabelText(/Prompt title/),
      'A clearer fictional title'
    )
    expect(screen.getByLabelText(/Prompt title/)).toHaveFocus()
  })

  it('sends all writable values on edit, retaining optional text and false booleans', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Edit capsule' }))
    expect(screen.getByLabelText(/Reviewed/)).not.toBeChecked()
    expect(screen.getByLabelText(/Improved/)).not.toBeChecked()
    expect(screen.getByLabelText(/^Notes/)).toHaveValue(example.notes)
    await user.clear(screen.getByLabelText(/Prompt title/))
    await user.type(
      screen.getByLabelText(/Prompt title/),
      'Compare accessible catalogue layouts'
    )
    fetch.mockResolvedValueOnce(
      json({
        capsule: {
          ...example,
          prompt_title: 'Compare accessible catalogue layouts'
        }
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', {
        name: 'Compare accessible catalogue layouts'
      })
    ).toBeVisible()
    const [path, options] = fetch.mock.calls[1]
    expect(path).toBe('/api/capsules/7')
    expect(options.method).toBe('PUT')
    const writable = Object.fromEntries(
      Object.entries(example).filter(
        ([name]) => !['id', 'user_id', 'created_at'].includes(name)
      )
    )
    expect(JSON.parse(options.body)).toEqual({
      ...writable,
      prompt_title: 'Compare accessible catalogue layouts'
    })
  })

  it('cancels editing without sending a mutation', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Edit capsule' }))
    await user.clear(screen.getByLabelText(/^Notes/))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('heading', { name: example.prompt_title })
    ).toBeVisible()
    expect(screen.getByText(example.notes)).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('names the record before deletion, supports cancellation and handles an empty 204', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Delete capsule' }))
    expect(
      screen.getByRole('heading', { name: `Delete “${example.prompt_title}”?` })
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Keep capsule' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Delete capsule' }))
    const parseJson = vi.fn()
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: parseJson })
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByText('No capsules yet')).toBeVisible()
    expect(
      screen.getByText('Capsule deleted.', { selector: '[role="status"]' })
    ).toBeVisible()
    expect(fetch.mock.calls[1][1].method).toBe('DELETE')
    expect(fetch.mock.calls[1][1].body).toBeUndefined()
    expect(parseJson).not.toHaveBeenCalled()
  })

  it('retains the record and presents retry feedback when deletion fails', async () => {
    const { fetch, user } = start([example])
    await openExample(user)
    await user.click(screen.getByRole('button', { name: 'Delete capsule' }))
    fetch.mockResolvedValueOnce(
      json({ error: 'Could not delete the capsule.' }, 500)
    )
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete the capsule.'
    )
    expect(
      screen.getByRole('button', { name: 'Delete permanently' })
    ).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Keep capsule' }))
    expect(
      screen.getByRole('heading', { name: example.prompt_title })
    ).toBeVisible()
  })

  it('renders prompts as text and does not link unsafe evidence URLs', async () => {
    const malicious = {
      ...example,
      prompt_text: '<img src=x onerror=alert(1)>',
      screenshot_url: 'javascript:alert(1)'
    }
    const { user } = start([malicious])
    await openExample(user)
    expect(screen.getByText(malicious.prompt_text)).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /View screenshot/ })
    ).not.toBeInTheDocument()
  })

  it('provides safe links and labelled timestamp metadata in the detail view', async () => {
    const { user } = start([example])
    await openExample(user)
    expect(screen.getByText('Version 2')).toHaveClass(
      'metadata-badge',
      'version-badge'
    )
    expect(
      screen
        .getAllByText('Accessibility')
        .find((element) => element.classList.contains('category-badge'))
    ).toHaveClass('metadata-badge', 'category-badge')
    const link = screen.getByRole('link', { name: /View screenshot/ })
    expect(link).toHaveAttribute('href', example.screenshot_url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('time')).toHaveAttribute(
      'dateTime',
      example.created_at
    )
  })

  it('uses keyboard navigation for opening a record', async () => {
    const { user } = start([example])
    const record = await screen.findByRole('button', {
      name: /Compare catalogue layouts/
    })
    record.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('heading', { name: example.prompt_title })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit capsule' })).toBeEnabled()
  })
})

describe('session rejection', () => {
  it('removes protected content when the capsule API returns 401', async () => {
    window.history.replaceState({}, '', '/dashboard')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ user: { id: '101', login: 'fictional-test-account' } })
        )
        .mockResolvedValueOnce(json({ error: 'Authentication required.' }, 401))
    )
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' })
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has ended'
    )
    expect(screen.queryByText('Your capsules')).not.toBeInTheDocument()
    expect(screen.queryByText('fictional-test-account')).not.toBeInTheDocument()
  })

  it('removes an open form if saving rejects an expired session', async () => {
    window.history.replaceState({}, '', '/dashboard')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ user: { id: '101', login: 'fictional-test-account' } })
      )
      .mockResolvedValueOnce(json({ capsules: [] }))
      .mockResolvedValueOnce(json({ error: 'Authentication required.' }, 401))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    await user.click(
      await screen.findByRole('button', { name: 'Create your first capsule' })
    )
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' })
    ).toBeVisible()
    expect(screen.queryByLabelText(/Prompt text/)).not.toBeInTheDocument()
  })

  it('handles 204 without requesting JSON', async () => {
    const parseJson = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: parseJson })
    )
    await expect(
      apiRequest('/api/auth/logout', { method: 'POST' })
    ).resolves.toBeNull()
    expect(parseJson).not.toHaveBeenCalled()
  })
})
