import { evidenceUrl, formatDate } from '../capsule-fields'

export function ReflectionStatus({ capsule }) {
  return (
    <div className="badges">
      <span className={capsule.reviewed ? 'badge done' : 'badge'}>
        {capsule.reviewed ? 'Reviewed' : 'Not reviewed'}
      </span>
      <span className={capsule.improved ? 'badge done' : 'badge'}>
        {capsule.improved ? 'Improved' : 'Not improved'}
      </span>
    </div>
  )
}

export default function CapsuleDetail({ capsule, onEdit, onDelete }) {
  const screenshot = evidenceUrl(capsule.screenshot_url)
  return (
    <>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{capsule.project_name}</p>
          <h1>{capsule.prompt_title}</h1>
          <p className="muted">
            Version {capsule.prompt_version} <span aria-hidden="true">·</span>{' '}
            Created{' '}
            <time dateTime={capsule.created_at}>
              {formatDate(capsule.created_at, true)}
            </time>
          </p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={onEdit}>
            Edit capsule
          </button>
          <button className="danger-text" onClick={onDelete}>
            Delete capsule
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel reading">
            <h2>Prompt</h2>
            <p className="preserve prompt-copy">{capsule.prompt_text}</p>
          </section>
          <section className="panel reading">
            <h2>Response summary</h2>
            <p className="preserve">
              {capsule.response_summary || 'No response summary recorded.'}
            </p>
          </section>
          <section className="panel reading">
            <h2>Notes</h2>
            <p className="preserve">{capsule.notes || 'No notes recorded.'}</p>
          </section>
        </div>
        <aside className="panel detail-aside">
          <h2>At a glance</h2>
          <ReflectionStatus capsule={capsule} />
          <dl>
            <dt>Project</dt>
            <dd>{capsule.project_name}</dd>
            <dt>Category</dt>
            <dd>{capsule.category || 'Uncategorised'}</dd>
            <dt>Usefulness</dt>
            <dd>{capsule.usefulness || 'Not recorded'}</dd>
            <dt>Version</dt>
            <dd>{capsule.prompt_version}</dd>
            <dt>Screenshot evidence</dt>
            <dd>
              {screenshot ? (
                <a href={screenshot} target="_blank" rel="noopener noreferrer">
                  View screenshot <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                'No screenshot linked.'
              )}
            </dd>
          </dl>
        </aside>
      </div>
    </>
  )
}
