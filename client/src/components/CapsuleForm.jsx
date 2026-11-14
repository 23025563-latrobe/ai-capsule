import { useEffect, useRef, useState } from 'react'
import {
  capsuleFields,
  capsuleValues,
  categorySuggestions,
  usefulnessOptions
} from '../capsule-fields'

const fieldLabels = {
  ...Object.fromEntries(capsuleFields.map(({ name, label }) => [name, label])),
  reviewed: 'Reviewed',
  improved: 'Improved'
}

function Field({ field, value, error, onChange, categories, savedUsefulness }) {
  const { name, label, rows, hint, type, maxLength, ...attributes } = field
  const descriptions = [hint && `${name}-hint`, error && `${name}-error`]
    .filter(Boolean)
    .join(' ')
  const props = {
    ...attributes,
    id: name,
    name,
    value,
    onChange: (event) => onChange(name, event.target.value),
    'aria-invalid': Boolean(error),
    'aria-describedby': descriptions || undefined
  }
  let control
  if (rows) control = <textarea {...props} maxLength={maxLength} rows={rows} />
  else if (type === 'select') {
    const legacy =
      savedUsefulness &&
      !usefulnessOptions.some((option) => option.value === savedUsefulness)
    control = (
      <select {...props}>
        {usefulnessOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {legacy && (
          <option value={savedUsefulness}>
            {savedUsefulness} (saved value)
          </option>
        )}
      </select>
    )
  } else
    control = (
      <input
        {...props}
        maxLength={maxLength}
        type={type || 'text'}
        list={name === 'category' ? 'category-suggestions' : undefined}
      />
    )

  return (
    <div className={`field ${rows ? 'wide' : ''}`}>
      <label htmlFor={name}>
        {label}
        {field.required ? (
          <span className="required"> *</span>
        ) : (
          <span className="optional"> (optional)</span>
        )}
      </label>
      {hint && (
        <p className="field-hint" id={`${name}-hint`}>
          {hint}
        </p>
      )}
      {control}
      {name === 'category' && (
        <datalist id="category-suggestions">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      )}
      {error && (
        <p className="field-error" id={`${name}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

export default function CapsuleForm({
  capsule,
  categories = categorySuggestions([]),
  onSave,
  onCancel,
  onSessionExpired
}) {
  const [values, setValues] = useState(() => capsuleValues(capsule))
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorAttempt, setErrorAttempt] = useState(0)
  const form = useRef(null)
  const summary = useRef(null)
  const pending = useRef(false)
  const errorEntries = Object.entries(errors).filter(([, message]) =>
    Boolean(message)
  )

  useEffect(() => {
    if (errorAttempt) {
      const invalid = form.current?.querySelector('[aria-invalid="true"]')
      if (invalid) invalid.focus()
      else summary.current?.focus()
    }
  }, [errorAttempt])

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
  }

  function focusField(event, name) {
    event.preventDefault()
    form.current?.elements.namedItem(name)?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const invalid = {}
    for (const field of capsuleFields) {
      if (field.required && !values[field.name].trim())
        invalid[field.name] = 'Enter a nonblank value.'
      else if (values[field.name].length > field.maxLength)
        invalid[field.name] = `Use at most ${field.maxLength} characters.`
    }
    if (values.screenshot_url.trim()) {
      try {
        const url = new URL(values.screenshot_url.trim())
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error()
      } catch {
        invalid.screenshot_url =
          'Use a full HTTP or HTTPS URL without credentials.'
      }
    }
    setErrors(invalid)
    if (Object.keys(invalid).length) {
      setFailure(
        'Your capsule has not been saved. Correct the following fields.'
      )
      setErrorAttempt((current) => current + 1)
      return
    }
    pending.current = true
    setSaving(true)
    setFailure('')
    try {
      const fields = { ...values }
      // The API defaults an omitted version, but rejects an explicitly empty one.
      if (!fields.prompt_version.trim()) delete fields.prompt_version
      await onSave(fields)
    } catch (error) {
      if (error.status === 401) onSessionExpired()
      else {
        setFailure(
          error.status === 400 && error.details?.length
            ? 'Your changes have not been saved. Correct the following errors.'
            : error.message
        )
        setErrors(
          Object.fromEntries(
            (error.details || []).map(({ field, message }) => [field, message])
          )
        )
        setErrorAttempt((current) => current + 1)
      }
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  function fields(names) {
    return capsuleFields
      .filter(({ name }) => names.includes(name))
      .map((field) => (
        <Field
          key={field.name}
          field={field}
          value={values[field.name]}
          error={errors[field.name]}
          onChange={change}
          categories={categories}
          savedUsefulness={capsule?.usefulness}
        />
      ))
  }

  return (
    <form ref={form} noValidate onSubmit={submit} className="capsule-form">
      {failure && (
        <div ref={summary} tabIndex={-1} className="notice error" role="alert">
          <p>{failure}</p>
          {errorEntries.length > 0 && (
            <ul>
              {errorEntries.map(([name, message]) => (
                <li key={name}>
                  {Object.hasOwn(fieldLabels, name) ? (
                    <a
                      href={`#${name}`}
                      onClick={(event) => focusField(event, name)}
                    >
                      {fieldLabels[name]}: {message}
                    </a>
                  ) : (
                    message
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset disabled={saving}>
        <legend>
          <span>01</span> Context
        </legend>
        <p className="section-description">
          Give this prompt a home and a title you can find again.{' '}
          <span>Required fields are marked *. Other fields are optional.</span>
        </p>
        <div className="field-grid">
          {fields([
            'project_name',
            'prompt_title',
            'prompt_version',
            'category'
          ])}
        </div>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>
          <span>02</span> Prompt
        </legend>
        <p className="section-description">
          Keep the original wording, including instructions and context.
        </p>
        <div className="field-grid">{fields(['prompt_text'])}</div>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>
          <span>03</span> Reflection & evidence
        </legend>
        <p className="section-description">
          Record what came back, what helped and what you would change.
        </p>
        <div className="field-grid">
          {fields([
            'response_summary',
            'usefulness',
            'screenshot_url',
            'notes'
          ])}
          <div className="checks wide">
            {[
              ['reviewed', 'Reviewed', 'I have checked the response.'],
              ['improved', 'Improved', 'I have improved the AI output.']
            ].map(([name, label, hint]) => (
              <div key={name}>
                <label htmlFor={name}>
                  <input
                    type="checkbox"
                    id={name}
                    name={name}
                    checked={values[name]}
                    aria-invalid={Boolean(errors[name])}
                    aria-describedby={`${name}-hint${errors[name] ? ` ${name}-error` : ''}`}
                    onChange={(event) => change(name, event.target.checked)}
                  />
                  {label}
                  <span id={`${name}-hint`}>{hint}</span>
                </label>
                {errors[name] && (
                  <p className="field-error" id={`${name}-error`}>
                    {errors[name]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="form-actions">
        <p role="status">
          {saving
            ? 'Saving your capsule…'
            : 'Your work is saved only when you choose Save capsule.'}
        </p>
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save capsule'}
          </button>
        </div>
      </div>
    </form>
  )
}
