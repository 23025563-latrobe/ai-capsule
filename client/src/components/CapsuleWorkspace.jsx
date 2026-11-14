import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api'
import { categorySuggestions, formatDate } from '../capsule-fields'
import CapsuleForm from './CapsuleForm'
import CapsuleDetail, { ReflectionStatus } from './CapsuleDetail'

export default function CapsuleWorkspace({ onSessionExpired }) {
  const [capsules, setCapsules] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const heading = useRef(null)
  const deletionPending = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/capsules', { signal: controller.signal })
      .then(({ capsules: records }) => {
        setCapsules(records)
        setLoading(false)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        if (error.status === 401) onSessionExpired()
        else {
          setLoadError(error.message)
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [reload, onSessionExpired])

  useEffect(() => {
    heading.current?.focus()
  }, [view])

  function show(nextView, capsule = selected) {
    setSelected(capsule)
    setView(nextView)
    setNotice('')
    setDeleteError('')
  }

  async function save(values) {
    setSaving(true)
    try {
      const { capsule } = await apiRequest(
        view === 'edit' ? `/api/capsules/${selected.id}` : '/api/capsules',
        {
          method: view === 'edit' ? 'PUT' : 'POST',
          body: values
        }
      )
      setCapsules((current) =>
        view === 'edit'
          ? current.map((item) => (item.id === capsule.id ? capsule : item))
          : [capsule, ...current]
      )
      setSelected(capsule)
      setView('detail')
      setNotice(view === 'edit' ? 'Changes saved.' : 'Capsule saved.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (deletionPending.current) return
    deletionPending.current = true
    setDeleting(true)
    setDeleteError('')
    try {
      await apiRequest(`/api/capsules/${selected.id}`, { method: 'DELETE' })
      setCapsules((current) =>
        current.filter((item) => item.id !== selected.id)
      )
      setSelected(null)
      setView('list')
      setNotice('Capsule deleted.')
    } catch (error) {
      if (error.status === 401) onSessionExpired()
      else setDeleteError(error.message)
    } finally {
      deletionPending.current = false
      setDeleting(false)
    }
  }

  return (
    <div className="workspace">
      <div
        ref={heading}
        tabIndex={-1}
        className="view-start"
        aria-label="Capsule workspace"
      >
        {view === 'list' ? (
          <p className="eyebrow">Your learning archive</p>
        ) : (
          <button
            className="back-link"
            onClick={() => show('list', null)}
            disabled={deleting || saving}
          >
            ← All capsules
          </button>
        )}
      </div>
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {view === 'list' && (
        <>
          <div className="page-heading">
            <div>
              <h1>
                Capsule workspace
                <span className="count">{capsules.length}</span>
              </h1>
              <p className="muted">
                Manage your saved prompts and response notes.
              </p>
            </div>
            <button
              onClick={() => show('create', null)}
              disabled={loading || Boolean(loadError)}
            >
              <span aria-hidden="true">＋</span> New capsule
            </button>
          </div>
          <section className="panel library" aria-label="Your capsules">
            <div className="panel-heading">
              <h2>Your capsules</h2>
              <span className="muted small">Most recent first</span>
            </div>
            {loading ? (
              <div className="empty" role="status">
                <span className="loading-dot" aria-hidden="true" />
                <h3>Loading your capsules…</h3>
                <p>Preparing your workspace.</p>
              </div>
            ) : loadError ? (
              <div className="empty">
                <h3>We couldn’t load your capsules</h3>
                <p role="alert">{loadError}</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setLoadError('')
                    setLoading(true)
                    setReload((value) => value + 1)
                  }}
                >
                  Try again
                </button>
              </div>
            ) : !capsules.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">
                  ＋
                </span>
                <h3>No capsules yet</h3>
                <p>
                  Create a capsule to save a prompt, summarise the response and
                  record your notes.
                </p>
                <button onClick={() => show('create', null)}>
                  Create your first capsule
                </button>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Capsule</th>
                      <th scope="col">Project</th>
                      <th scope="col">Reflection</th>
                      <th scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capsules.map((capsule) => (
                      <tr key={capsule.id}>
                        <td>
                          <button
                            className="record-link"
                            onClick={() => show('detail', capsule)}
                          >
                            {capsule.prompt_title}
                            <span aria-hidden="true">↗</span>
                          </button>
                          <span className="record-sub">
                            Version {capsule.prompt_version} ·{' '}
                            {capsule.category || 'Uncategorised'}
                          </span>
                        </td>
                        <td>{capsule.project_name}</td>
                        <td>
                          <ReflectionStatus capsule={capsule} />
                        </td>
                        <td>
                          <time dateTime={capsule.created_at}>
                            {formatDate(capsule.created_at)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {(view === 'create' || view === 'edit') && (
        <>
          <div className="page-heading">
            <div>
              <h1>{view === 'edit' ? 'Edit capsule' : 'Create a capsule'}</h1>
              <p className="muted">
                {view === 'edit'
                  ? 'Refine the record while keeping its original creation date.'
                  : 'Turn an AI interaction into a record you can return to.'}
              </p>
            </div>
            <span className="step-note">Context / Prompt / Reflection</span>
          </div>
          <CapsuleForm
            key={selected?.id ?? 'new'}
            capsule={view === 'edit' ? selected : undefined}
            categories={categorySuggestions(capsules)}
            onSave={save}
            onCancel={() => show(selected ? 'detail' : 'list')}
            onSessionExpired={onSessionExpired}
          />
        </>
      )}
      {view === 'detail' && selected && (
        <CapsuleDetail
          capsule={selected}
          onEdit={() => show('edit')}
          onDelete={() => show('delete')}
        />
      )}
      {view === 'delete' && selected && (
        <section className="panel delete-panel">
          <p className="eyebrow">Delete capsule</p>
          <h1>Delete “{selected.prompt_title}”?</h1>
          <p>
            This permanently removes this capsule from{' '}
            <strong>{selected.project_name}</strong>. This action cannot be
            undone.
          </p>
          {deleteError && (
            <p className="notice error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="button-row">
            <button
              className="secondary"
              disabled={deleting}
              onClick={() => show('detail')}
            >
              Keep capsule
            </button>
            <button className="danger" disabled={deleting} onClick={remove}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
