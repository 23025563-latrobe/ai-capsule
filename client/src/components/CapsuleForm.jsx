import { useEffect, useRef, useState } from 'react'
import { capsuleFields, capsuleValues } from '../capsule-fields'

function Field({ field, value, error, onChange }) {
  const { name, label, rows, ...attributes } = field
  const props = {
    ...attributes,
    id: name,
    name,
    value,
    onChange: (event) => onChange(name, event.target.value),
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${name}-error` : undefined
  }
  return (
    <div className={`field ${rows ? 'wide' : ''}`}>
      <label htmlFor={name}>
        {label}
        {field.required && <span className="required"> *</span>}
      </label>
      {rows ? (
        <textarea {...props} rows={rows} />
      ) : (
        <input {...props} type={field.type || 'text'} />
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
  const pending = useRef(false)

  useEffect(() => {
    if (errorAttempt)
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [errorAttempt])

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
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
      setFailure('Check the highlighted fields, then save again.')
      setErrorAttempt((current) => current + 1)
      return
    }
    pending.current = true
    setSaving(true)
    setFailure('')
    try {
      await onSave(values)
    } catch (error) {
      if (error.status === 401) onSessionExpired()
      else {
        setFailure(
          error.status === 400 && error.details?.length
            ? 'Check the highlighted fields. Your changes have not been saved.'
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
        />
      ))
  }

  return (
    <form ref={form} noValidate onSubmit={submit} className="capsule-form">
      {failure && (
        <p className="notice error" role="alert">
          {failure}
        </p>
      )}
      <fieldset disabled={saving}>
        <legend>
          <span>01</span> Context
        </legend>
        <p className="section-description">
          Give this prompt a home and a title you can find again.{' '}
          <span>Required fields are marked *.</span>
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
            <label>
              <input
                type="checkbox"
                checked={values.reviewed}
                onChange={(event) => change('reviewed', event.target.checked)}
              />{' '}
              Reviewed <span>I have checked the response.</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={values.improved}
                onChange={(event) => change('improved', event.target.checked)}
              />{' '}
              Improved <span>I have refined the prompt.</span>
            </label>
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
