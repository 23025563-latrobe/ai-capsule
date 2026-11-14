import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CapsuleForm from './CapsuleForm'

const saved = {
  project_name: 'Fictional Coastal Library',
  prompt_title: 'Compare catalogue layouts',
  prompt_version: 'draft-A',
  prompt_text: 'Compare two accessible layouts.',
  response_summary: 'A list preserves reading order.',
  category: '  Community Mapping  ',
  usefulness: 'Useful after a manual check',
  screenshot_url: 'https://example.com/fictional.png',
  notes: 'Fictional test notes',
  reviewed: false,
  improved: false
}

function setup(capsule) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <CapsuleForm
      capsule={capsule}
      onSave={onSave}
      onCancel={vi.fn()}
      onSessionExpired={vi.fn()}
    />
  )
  return { user: userEvent.setup(), onSave }
}

async function fillRequired(user) {
  await user.type(screen.getByLabelText(/^Project name/), 'Fictional library')
  await user.type(screen.getByLabelText(/^Prompt title/), 'Compare layouts')
  await user.type(
    screen.getByLabelText(/^Prompt text/),
    'Compare two catalogue layouts.'
  )
}

describe('capsule form controls', () => {
  it.each(['Coding', 'Writing', 'Research', 'Study', 'Planning', 'Other'])(
    'saves the suggested %s category as a single string',
    async (category) => {
      const { user, onSave } = setup()
      await fillRequired(user)
      const input = screen.getByLabelText(/^Category/)
      const list = document.getElementById(input.getAttribute('list'))
      expect(
        [...list.options].some((option) => option.value === category)
      ).toBe(true)
      await user.type(input, category)
      await user.click(screen.getByRole('button', { name: 'Save capsule' }))
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ category }))
    }
  )

  it('saves a custom category without replacing prompt or summary text', async () => {
    const { user, onSave } = setup()
    await fillRequired(user)
    await user.type(screen.getByLabelText(/^Category/), 'Community research')
    await user.type(
      screen.getByLabelText(/^Response summary/),
      'A concise fictional response.'
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'Community research',
        prompt_text: 'Compare two catalogue layouts.',
        response_summary: 'A concise fictional response.',
        reviewed: false,
        improved: false
      })
    )
  })

  it.each([
    ['Not rated', ''],
    ['Good', 'Good'],
    ['Needs improvement', 'Needs improvement']
  ])('maps the %s rating to its API string', async (label, value) => {
    const { user, onSave } = setup()
    await fillRequired(user)
    const select = screen.getByRole('combobox', { name: /^Usefulness/ })
    await user.selectOptions(
      select,
      within(select).getByRole('option', { name: label, exact: true })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        usefulness: value,
        reviewed: false,
        improved: false
      })
    )
  })

  it('preserves a saved category, legacy rating, version, optional fields and false flags on edit', async () => {
    const { user, onSave } = setup(saved)
    expect(screen.getByLabelText(/^Category/)).toHaveValue(saved.category)
    const usefulness = screen.getByRole('combobox', { name: /^Usefulness/ })
    expect(usefulness).toHaveValue(saved.usefulness)
    expect(
      within(usefulness).getByRole('option', {
        name: /Useful after a manual check/
      })
    ).toBeVisible()
    expect(screen.getByLabelText(/^Prompt version/)).toHaveValue('draft-A')
    await user.clear(screen.getByLabelText(/^Prompt title/))
    await user.type(
      screen.getByLabelText(/^Prompt title/),
      'Compare updated layouts'
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(onSave).toHaveBeenCalledWith({
      ...saved,
      prompt_title: 'Compare updated layouts'
    })
  })

  it('defaults new versions to v1 and permits omission without sending an invalid empty string', async () => {
    const { user, onSave } = setup()
    const version = screen.getByLabelText(/^Prompt version/)
    expect(version).toHaveValue('v1')
    expect(version).not.toBeRequired()
    await fillRequired(user)
    await user.clear(version)
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('prompt_version')
  })

  it('links lower-section validation errors to their controls while preserving input', async () => {
    const { user, onSave } = setup(saved)
    onSave.mockRejectedValueOnce(
      Object.assign(new Error('Invalid capsule.'), {
        status: 400,
        details: [
          { field: 'response_summary', message: 'Please shorten this summary.' }
        ]
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    const alert = await screen.findByRole('alert')
    await user.click(
      within(alert).getByRole('link', {
        name: 'Response summary: Please shorten this summary.'
      })
    )
    expect(screen.getByLabelText(/^Response summary/)).toHaveFocus()
    expect(screen.getByLabelText(/^Response summary/)).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(screen.getByLabelText(/^Response summary/)).toHaveValue(
      saved.response_summary
    )
    expect(screen.getByLabelText(/^Prompt text/)).toHaveValue(saved.prompt_text)
    expect(
      screen.getByLabelText(/^Response summary/)
    ).toHaveAccessibleDescription(
      /Summarise the response you received.*Please shorten this summary/
    )
  })

  it('announces request-level errors even when there is no field target', async () => {
    const { user, onSave } = setup(saved)
    onSave.mockRejectedValueOnce(
      Object.assign(new Error('Invalid request.'), {
        status: 400,
        details: [
          { field: 'body', message: 'The request could not be accepted.' }
        ]
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
    expect(alert).toHaveTextContent('The request could not be accepted.')
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Prompt text/)).toHaveValue(saved.prompt_text)
  })

  it('keeps rating, Reviewed and Improved independent', async () => {
    const { user, onSave } = setup(saved)
    await user.click(screen.getByLabelText(/^Improved/))
    expect(screen.getByLabelText(/^Reviewed/)).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: /^Usefulness/ })).toHaveValue(
      saved.usefulness
    )
    await user.click(screen.getByRole('button', { name: 'Save capsule' }))
    expect(onSave).toHaveBeenCalledWith({ ...saved, improved: true })
  })
})
