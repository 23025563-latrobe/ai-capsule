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
    hint: 'For example, v1 or v2. Leave blank to use version 1.'
  },
  {
    name: 'category',
    label: 'Category',
    maxLength: 80,
    hint: 'Choose a suggestion or enter your own.'
  },
  {
    name: 'prompt_text',
    label: 'Prompt text',
    maxLength: 20000,
    required: true,
    hint: 'Paste the prompt you sent to the AI tool.',
    rows: 8
  },
  {
    name: 'response_summary',
    label: 'Response summary',
    maxLength: 10000,
    hint: 'Summarise the response you received.',
    rows: 5
  },
  { name: 'usefulness', label: 'Usefulness', maxLength: 200, type: 'select' },
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
        capsule[name] ?? (name === 'prompt_version' ? 'v1' : '')
      ])
    ),
    reviewed: capsule.reviewed ?? false,
    improved: capsule.improved ?? false
  }
}

export const usefulnessOptions = [
  { value: '', label: 'Not rated' },
  { value: 'Good', label: 'Good' },
  { value: 'Needs improvement', label: 'Needs improvement' }
]

export function categorySuggestions(capsules) {
  const suggestions = [
    'Coding',
    'Writing',
    'Research',
    'Study',
    'Planning',
    'Other'
  ]
  const seen = new Set(suggestions.map((value) => value.toLowerCase()))
  for (const capsule of capsules) {
    const category =
      typeof capsule.category === 'string' ? capsule.category.trim() : ''
    if (category && !seen.has(category.toLowerCase())) {
      suggestions.push(category)
      seen.add(category.toLowerCase())
    }
  }
  return suggestions
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
