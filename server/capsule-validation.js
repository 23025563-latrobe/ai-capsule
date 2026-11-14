const textLimits = {
  project_name: 120,
  prompt_title: 200,
  prompt_version: 40,
  prompt_text: 20_000,
  response_summary: 10_000,
  category: 80,
  usefulness: 200,
  screenshot_url: 2048,
  notes: 10_000,
};
const requiredFields = new Set(['project_name', 'prompt_title', 'prompt_text', 'prompt_version']);
const defaults = {
  prompt_version: '1', response_summary: '', category: '', usefulness: '',
  reviewed: false, improved: false, screenshot_url: '', notes: '',
};

// POST and PUT use the same complete representation; omitted optional values reset.
export function validateCapsule(body) {
  const fields = { ...defaults };
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { fields, errors: [{ field: 'body', message: 'Must be a JSON object.' }] };
  }

  for (const [field, value] of Object.entries(body)) {
    if (!Object.hasOwn(textLimits, field) && field !== 'reviewed' && field !== 'improved') {
      errors.push({ field, message: 'Field is not writable.' });
      continue;
    }
    if (field === 'reviewed' || field === 'improved') {
      if (typeof value !== 'boolean') errors.push({ field, message: 'Must be true or false.' });
      else fields[field] = value;
      continue;
    }
    if (typeof value !== 'string') {
      errors.push({ field, message: 'Must be a string.' });
    } else if (value.length > textLimits[field]) {
      errors.push({ field, message: `Must be at most ${textLimits[field]} characters.` });
    } else {
      fields[field] = field === 'screenshot_url' ? value.trim() : value;
    }
  }

  for (const field of requiredFields) {
    if (typeof fields[field] !== 'string' || !fields[field].trim()) {
      errors.push({ field, message: 'A nonblank value is required.' });
    }
  }
  if (fields.screenshot_url) {
    try {
      const url = new URL(fields.screenshot_url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Unsupported screenshot URL');
      }
    } catch {
      errors.push({ field: 'screenshot_url', message: 'Must be an HTTP or HTTPS URL without credentials, or empty.' });
    }
  }
  return { fields, errors };
}
