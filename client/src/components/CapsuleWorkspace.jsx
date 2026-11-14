import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api'
import {
  categorySuggestions,
  formatDate,
  usefulnessOptions
} from '../capsule-fields'
import CapsuleForm from './CapsuleForm'
import CapsuleDetail, { ReflectionStatus } from './CapsuleDetail'

const searchableFields = [
  'prompt_title',
  'project_name',
  'prompt_text',
  'response_summary',
  'category',
  'notes'
]

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
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [usefulnessFilter, setUsefulnessFilter] = useState('all')
  const [reviewFilter, setReviewFilter] = useState('all')
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

  const categoryOptions = new Map()
  for (const capsule of capsules) {
    const category = capsule.category?.trim()
    if (category) {
      const key = category.toLowerCase()
      if (!categoryOptions.has(key)) categoryOptions.set(key, category)
    }
  }
  const categories = [...categoryOptions.entries()].sort((left, right) =>
    left[1].localeCompare(right[1])
  )
  const hasUncategorisedCapsules = capsules.some(
    (capsule) => !capsule.category?.trim()
  )
  const standardUsefulness = new Set(
    usefulnessOptions.map(({ value }) => value)
  )
  const legacyUsefulness = [
    ...new Set(
      capsules
        .map((capsule) => capsule.usefulness ?? '')
        .filter((value) => value && !standardUsefulness.has(value))
    )
  ].sort((left, right) => left.localeCompare(right))
  const ratingOptions = [
    ...usefulnessOptions.map(({ value, label }) => ({
      value: `value:${value}`,
      label
    })),
    ...legacyUsefulness.map((value) => ({
      value: `value:${value}`,
      label: value
    }))
  ]
  const searchTerm = searchText.trim().toLowerCase()
  const filteredCapsules = capsules.filter((capsule) => {
    if (
      searchTerm &&
      !searchableFields.some((field) =>
        String(capsule[field] ?? '')
          .toLowerCase()
          .includes(searchTerm)
      )
    ) {
      return false
    }
    if (categoryFilter === 'uncategorised' && capsule.category?.trim()) {
      return false
    }
    if (
      categoryFilter.startsWith('category:') &&
      `category:${capsule.category?.trim().toLowerCase() ?? ''}` !==
        categoryFilter
    ) {
      return false
    }
    if (
      usefulnessFilter !== 'all' &&
      `value:${capsule.usefulness ?? ''}` !== usefulnessFilter
    ) {
      return false
    }
    if (reviewFilter === 'reviewed' && !capsule.reviewed) return false
    if (reviewFilter === 'not-reviewed' && capsule.reviewed) return false
    return true
  })
  const hasActiveFilters =
    Boolean(searchTerm) ||
    categoryFilter !== 'all' ||
    usefulnessFilter !== 'all' ||
    reviewFilter !== 'all'
  const showMatchingCount = !loading && !loadError && capsules.length > 0

  function clearSearchAndFilters() {
    setSearchText('')
    setCategoryFilter('all')
    setUsefulnessFilter('all')
    setReviewFilter('all')
  }

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
                {showMatchingCount && (
                  <span
                    className="count"
                    aria-label={`${filteredCapsules.length} matching capsules`}
                  >
                    {filteredCapsules.length}
                  </span>
                )}
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
              <div className="panel-summary">
                {showMatchingCount && (
                  <span className="muted small" aria-live="polite">
                    {filteredCapsules.length}{' '}
                    {filteredCapsules.length === 1 ? 'match' : 'matches'}
                  </span>
                )}
                <span className="muted small">Most recent first</span>
              </div>
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
              <>
                <div className="capsule-controls">
                  <div className="capsule-search">
                    <label htmlFor="capsule-search">Search capsules</label>
                    <div className="search-input-row">
                      <input
                        id="capsule-search"
                        type="search"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                      />
                      <button
                        className="secondary search-clear"
                        type="button"
                        disabled={!searchText}
                        onClick={() => setSearchText('')}
                      >
                        Clear search
                      </button>
                    </div>
                  </div>
                  <div className="filter-grid">
                    <div className="filter-field">
                      <label htmlFor="capsule-category-filter">Category</label>
                      <select
                        id="capsule-category-filter"
                        value={categoryFilter}
                        onChange={(event) =>
                          setCategoryFilter(event.target.value)
                        }
                      >
                        <option value="all">All categories</option>
                        {hasUncategorisedCapsules && (
                          <option value="uncategorised">Uncategorised</option>
                        )}
                        {categories.map(([value, label]) => (
                          <option key={value} value={`category:${value}`}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-field">
                      <label htmlFor="capsule-usefulness-filter">
                        Usefulness
                      </label>
                      <select
                        id="capsule-usefulness-filter"
                        value={usefulnessFilter}
                        onChange={(event) =>
                          setUsefulnessFilter(event.target.value)
                        }
                      >
                        <option value="all">All ratings</option>
                        {ratingOptions.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-field">
                      <label htmlFor="capsule-review-filter">
                        Review status
                      </label>
                      <select
                        id="capsule-review-filter"
                        value={reviewFilter}
                        onChange={(event) =>
                          setReviewFilter(event.target.value)
                        }
                      >
                        <option value="all">All statuses</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="not-reviewed">Not reviewed</option>
                      </select>
                    </div>
                  </div>
                  {hasActiveFilters && filteredCapsules.length > 0 && (
                    <button
                      className="quiet filter-reset"
                      type="button"
                      onClick={clearSearchAndFilters}
                    >
                      Clear search and filters
                    </button>
                  )}
                </div>
                {filteredCapsules.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Capsule</th>
                          <th scope="col">Project</th>
                          <th scope="col">Review status</th>
                          <th scope="col">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCapsules.map((capsule) => (
                          <tr key={capsule.id}>
                            <td>
                              <button
                                className="record-link"
                                onClick={() => show('detail', capsule)}
                              >
                                {capsule.prompt_title}
                                <span aria-hidden="true">›</span>
                              </button>
                              <span className="record-sub">
                                <span className="metadata-badge version-badge">
                                  Version {capsule.prompt_version}
                                </span>
                                <span className="metadata-badge category-badge">
                                  {capsule.category || 'Uncategorised'}
                                </span>
                              </span>
                            </td>
                            <td>{capsule.project_name}</td>
                            <td data-label="Review status">
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
                ) : (
                  <div className="empty">
                    <h3>No capsules match your search and filters.</h3>
                    <button
                      className="secondary"
                      onClick={clearSearchAndFilters}
                    >
                      Clear search and filters
                    </button>
                  </div>
                )}
              </>
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
