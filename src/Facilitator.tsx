import { useEffect, useRef, useState } from 'react'
import { AccessBadge, CloseIcon } from './components/Icons'
import type { FailureMode } from './flow/ShareFlow'
import type { LogEntry } from './log'
import {
  PEOPLE,
  PROJECT_ID,
  descendants,
  displayPath,
  getItem,
  personName,
  roleOf,
  type Item,
  type PersonId,
  type Scenario,
} from './model'

interface Props {
  scenario: Scenario
  viewer: PersonId
  onViewer: (p: PersonId) => void
  failureMode: FailureMode
  onFailureMode: (m: FailureMode) => void
  onOpen: (item: Item) => void
  onReset: () => void
  onParticipant: () => void
  onClose: () => void
  log: LogEntry[]
}

/** Facilitator-only overlay drawer. Never rendered in participant mode. */
export function Facilitator({
  scenario,
  viewer,
  onViewer,
  failureMode,
  onFailureMode,
  onOpen,
  onReset,
  onParticipant,
  onClose,
  log,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false)
  const items = [getItem(scenario, PROJECT_ID), ...descendants(scenario, PROJECT_ID)]
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [])

  const download = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `study-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <aside
      ref={ref}
      className="panel"
      aria-labelledby="panel-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.menu')) {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="panel-top">
        <div>
          <span className="panel-kicker">Study facilitator tools — not part of Drive</span>
          <h2 id="panel-title" tabIndex={-1}>
            Facilitator
          </h2>
        </div>
        <button type="button" className="icon-button" aria-label="Close facilitator tools" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="panel-scroll">
        <div className="panel-head">
          <p className="panel-note">Hidden from participants. Toggle modes with Alt+Shift+F or ?mode=facilitator.</p>
          <button type="button" className="btn btn-text small" onClick={onParticipant}>
            Switch to participant
          </button>
        </div>

        <section>
          <h3>Scenario</h3>
          {confirmReset ? (
            <div className="button-row">
              <span className="panel-note">Restore files, roles, location and settings, and clear the log?</span>
              <button type="button" className="btn btn-text small" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger small"
                onClick={() => {
                  onReset()
                  setConfirmReset(false)
                }}
              >
                Reset
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-tonal small" onClick={() => setConfirmReset(true)}>
              Reset scenario…
            </button>
          )}
        </section>

        <section>
          <h3>
            <label htmlFor="fail-mode">Failure simulation</label>
          </h3>
          <select id="fail-mode" value={failureMode} onChange={(e) => onFailureMode(e.target.value as FailureMode)}>
            <option value="off">Off — apply succeeds</option>
            <option value="next">Fail next attempt only</option>
            <option value="always">Fail every attempt</option>
          </select>
          <p className="panel-note">
            All-or-nothing simulation: a failure applies no changes. This does not model real Drive behaviour.
          </p>
        </section>

        <section>
          <h3>
            <label htmlFor="preview-as">Preview access as</label>
          </h3>
          <select id="preview-as" value={viewer} onChange={(e) => onViewer(e.target.value as PersonId)}>
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="panel-note">Inspection tool only. Not a proposed Drive capability.</p>
          <div className="open-as">
            <span className="panel-note">Open by link as {personName(viewer)}:</span>
            {items.map((i) => (
              <button key={i.id} type="button" className="btn btn-outline small" onClick={() => onOpen(i)}>
                {i.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Current simulated access</h3>
          <table className="access-table compact">
            <thead>
              <tr>
                <th scope="col">Item</th>
                {PEOPLE.map((p) => (
                  <th key={p.id} scope="col">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <th scope="row">{displayPath(scenario, i.id)}</th>
                  {PEOPLE.map((p) => (
                    <td key={p.id}>
                      <AccessBadge role={roleOf(scenario, i.id, p.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="log-section">
          <div className="panel-head">
            <h3>Event log ({log.length})</h3>
            <button type="button" className="btn btn-text small" onClick={download} disabled={!log.length}>
              Download JSON
            </button>
          </div>
          <p className="panel-note">
            Stored in memory on this device only. Elapsed times are prototype timings, not product performance.
          </p>
          <ol className="log" aria-live="off">
            {[...log].reverse().map((e) => (
              <li key={e.seq}>
                <span className="log-time">+{(e.elapsedMs / 1000).toFixed(1)}s</span>
                <span className="log-type">{e.type}</span>
                <span className="log-detail">{e.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </aside>
  )
}
