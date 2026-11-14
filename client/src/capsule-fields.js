export const capsuleFields = [
  {
    name: 'project_name',
    label: 'Project name',
    maxLength: 120,
    required: true
  },
  {
    name: 'prompt_title',
    label: 'Prompt title',
    maxLength: 200,
    required: true
  },
  {
    name: 'prompt_version',
    label: 'Prompt version',
    maxLength: 40,
    required: true
  },
  { name: 'category', label: 'Category', maxLength: 80 },
  {
    name: 'prompt_text',
    label: 'Prompt text',
    maxLength: 20000,
    required: true,
    rows: 8
  },
  {
    name: 'response_summary',
    label: 'Response summary',
    maxLength: 10000,
    rows: 5
  },
  { name: 'usefulness', label: 'Usefulness', maxLength: 200 },
  {
    name: 'screenshot_url',
    label: 'Screenshot evidence URL',
    maxLength: 2048,
    type: 'url'
  },
  { name: 'notes', label: 'Notes', maxLength: 10000, rows: 4 }
]

export function capsuleValues(capsule = {}) {
  return {
    ...Object.fromEntries(
      capsuleFields.map(({ name }) => [
        name,
        capsule[name] ?? (name === 'prompt_version' ? '1' : '')
      ])
    ),
    reviewed: capsule.reviewed ?? false,
    improved: capsule.improved ?? false
  }
}

export function formatDate(value, full = false) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: full ? 'long' : 'medium',
    ...(full ? { timeStyle: 'short' } : {})
  }).format(new Date(value))
}

export function evidenceUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
