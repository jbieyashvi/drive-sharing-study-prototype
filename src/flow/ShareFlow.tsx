import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { Menu, type MenuItem } from '../components/Menu'
import {
  AccessBadge,
  CaretIcon,
  CloseIcon,
  FolderIcon,
  HelpIcon,
  ImageIcon,
  InfoIcon,
  LimitedFolderIcon,
  LinkIcon,
  LockIcon,
  SettingsIcon,
} from '../components/Icons'
import {
  PEOPLE,
  ROOT_ID,
  SHARE_ROLES,
  access,
  applyRemoveFromFolder,
  applyRestrict,
  applyShareFile,
  canOpen,
  children,
  descendants,
  displayPath,
  getItem,
  isLimited,
  lostAccess,
  peopleWithAccess,
  personName,
  roleOf,
  validateFolderName,
  type PersonId,
  type Role,
  type Scenario,
} from '../model'
import type { LogFn, Variant } from '../log'

export type FailureMode = 'off' | 'next' | 'always'

type Step =
  | 'share'
  | 'add'
  | 'addReview'
  | 'decide'
  | 'removeReview'
  | 'setup'
  | 'destination'
  | 'people'
  | 'review'
  | 'applying'
  | 'failed'
  | 'result'
  | 'summary'

type Branch = 'project' | 'restrict' | 'share'

interface Outcome {
  branch: Branch
  operations: string[]
  before: Scenario
  after: Scenario
  newFolderId?: string
}

interface Props {
  scenario: Scenario
  fileId: string
  failureMode: FailureMode
  onFailureUsed: () => void
  onCommit: (s: Scenario) => void
  onClose: (navigateTo?: string) => void
  /** Shows the shared "Not available in this prototype" notice. */
  onUnavailable: (what: string) => void
  /** Shows a short toast. */
  onNotice: (text: string) => void
  log: LogFn
  variant: Variant
}

const DEFAULT_FOLDER_NAME = 'Private files'
const APPLY_DELAY_MS = 1400
const DRAFT_STEPS: Step[] = ['setup', 'destination', 'people', 'review', 'addReview', 'failed']
// Placeholder copied by "Copy file link"; it is not a real Drive address.
const studyLink = (fileId: string) => `https://example.com/study-file/${fileId}`

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const initials = (id: PersonId) => (id === 'you' ? 'Y' : personName(id)[0])

function Avatar({ id }: { id: PersonId }) {
  return (
    <span className={`avatar avatar-${id}`} aria-hidden="true">
      {initials(id)}
    </span>
  )
}

export function ShareFlow({
  scenario,
  fileId,
  failureMode,
  onFailureUsed,
  onCommit,
  onClose,
  onUnavailable,
  onNotice,
  log,
  variant,
}: Props) {
  const file = getItem(scenario, fileId)
  // Frozen at open: after a successful move the file's parent changes, but the
  // flow (result, Return to project) still refers to where the file started.
  const [fileParentId] = useState(file.parentId!)
  const short = file.name.replace(/\.[^.]+$/, '')

  const [step, setStep] = useState<Step>('share')
  const [target, setTarget] = useState<PersonId | null>(null)
  const [sourceId, setSourceId] = useState(fileParentId)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [destMode, setDestMode] = useState<'existing' | 'new' | null>(null)
  const [folderName, setFolderName] = useState(DEFAULT_FOLDER_NAME)
  const [destAttempted, setDestAttempted] = useState(false)
  const [keep, setKeep] = useState<Partial<Record<PersonId, boolean>>>({})
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // Where Discard leads: close the whole dialog, or drop only the add-people draft.
  const [confirmDiscard, setConfirmDiscard] = useState<'close' | 'share' | null>(null)
  // Add-people draft (restoration scenario). Nothing is shared until confirmation.
  const [recipient, setRecipient] = useState<PersonId | null>(null)
  const [shareRole, setShareRole] = useState<Exclude<Role, 'Owner'>>('Viewer')
  const [query, setQuery] = useState('')
  const [activeOpt, setActiveOpt] = useState(0)
  const [addError, setAddError] = useState<string | null>(null)
  const [backFromAdd, setBackFromAdd] = useState(false)
  const recipientInput = useRef<HTMLInputElement>(null)
  // Version B: where the restrict draft started, so Back from review returns there.
  const [restrictEntry, setRestrictEntry] = useState<'decide' | 'setup'>('decide')
  const [existingOpen, setExistingOpen] = useState(false)
  const applying = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // While the flow is open the file has not moved (changes commit only at the end),
  // except on the result screens, which read from the stored outcome.
  const sourceName = getItem(scenario, sourceId).name
  const targetName = target ? personName(target) : ''
  const collaborators = peopleWithAccess(scenario, fileId).filter((p) => roleOf(scenario, fileId, p) !== 'Owner')
  const owners = peopleWithAccess(scenario, fileId).filter((p) => roleOf(scenario, fileId, p) === 'Owner')
  const limitedFolders = descendants(scenario, fileParentId).filter((i) => isLimited(i) && i.parentId === fileParentId)

  const nameError = validateFolderName(scenario, fileParentId, folderName)
  const destError =
    destMode === null
      ? `Choose where ${short} should move.`
      : destMode === 'existing'
        ? 'Choose a folder, or create a new one.'
        : nameError

  const keptList = collaborators.filter((p) => keep[p])
  const plan = { fileId, folderName, keep: keptList }

  const preview = useMemo(() => {
    if (step !== 'review') return null
    try {
      return applyRestrict(scenario, plan)
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scenario, folderName, keptList.join()])

  const sharePreview = useMemo(() => {
    if (step !== 'addReview' || !recipient) return null
    try {
      return applyShareFile(scenario, fileId, recipient, shareRole)
    } catch {
      return null
    }
  }, [step, scenario, fileId, recipient, shareRole])

  const removalPreview = useMemo(() => {
    if (step !== 'removeReview' || !target) return null
    const res = applyRemoveFromFolder(scenario, sourceId, target)
    return {
      ...res,
      lost: lostAccess(scenario, res.scenario, sourceId, target),
    }
  }, [step, scenario, sourceId, target])

  // Logged at the transition, not in an effect: StrictMode re-runs effects on
  // mount, which used to double-log. The initial 'share' screen is logged by
  // whoever opens the flow.
  const go = (next: Step) => {
    log('screen_opened', `${next} (${file.name})`)
    setStep(next)
  }

  const isDirty = DRAFT_STEPS.includes(step) || (step === 'add' && recipient !== null)
  const requestClose = () => {
    if (step === 'applying') return
    if (isDirty) {
      setConfirmDiscard('close')
      return
    }
    log('action_selected', `close flow from ${step}`)
    onClose(step === 'result' || step === 'summary' ? fileParentId : undefined)
  }

  const startRemove = (person: PersonId) => {
    log('action_selected', `Remove access: ${personName(person)} on ${file.name}`)
    if (person !== target) {
      // A different person starts a fresh draft.
      setTarget(person)
      setSourceId(access(scenario, fileId, person)?.sourceId ?? fileParentId)
      setBranch(null)
      setDestMode(null)
      setFolderName(DEFAULT_FOLDER_NAME)
      setDestAttempted(false)
      setKeep({})
    }
    go('decide')
  }

  // Version B: the role menu's restrict action goes straight to the combined setup screen.
  const startRestrict = (person: PersonId) => {
    log('action_selected', `Restrict access to this file: ${personName(person)} on ${file.name}`)
    setTarget(person)
    setSourceId(access(scenario, fileId, person)?.sourceId ?? fileParentId)
    setBranch('restrict')
    setRestrictEntry('setup')
    setDestMode('new')
    setFolderName(DEFAULT_FOLDER_NAME)
    setDestAttempted(false)
    setExistingOpen(false)
    setKeep(Object.fromEntries(collaborators.map((p) => [p, p !== person])))
    go('setup')
  }

  const chooseBranch = (b: Branch) => {
    setBranch(b)
    setRestrictEntry('decide')
    log(
      'action_selected',
      b === 'project' ? 'A: Remove access to the project' : 'B: Keep project access, restrict this file',
    )
    if (b === 'restrict' && Object.keys(keep).length === 0) {
      setKeep(Object.fromEntries(collaborators.map((p) => [p, p !== target])))
    }
    go(b === 'project' ? 'removeReview' : 'destination')
  }

  const continueFromDestination = () => {
    setDestAttempted(true)
    if (destError) {
      log('action_selected', `Continue blocked: ${destError}`)
      if (destMode === 'new') nameInput.current?.focus()
      return
    }
    log('destination_chosen', `new folder “${folderName.trim()}” in ${getItem(scenario, fileParentId).name}`)
    go('people')
  }

  const reviewFromSetup = () => {
    setDestAttempted(true)
    if (nameError) {
      log('action_selected', `Review blocked: ${nameError}`)
      nameInput.current?.focus()
      return
    }
    log('destination_chosen', `new folder “${folderName.trim()}” in ${getItem(scenario, fileParentId).name}`)
    openReview()
  }

  const toggleKeep = (p: PersonId, value: boolean) => {
    const next = { ...keep, [p]: value }
    setKeep(next)
    const summary = collaborators.map((c) => `${personName(c)}:${next[c] ? 'keep' : 'lose'}`).join(', ')
    log('people_selection_changed', `${personName(p)} ${value ? 'selected' : 'unselected'} → ${summary}`)
  }

  const openReview = () => {
    log('review_opened', `keep: ${keptList.map(personName).join(', ') || 'owner only'}`)
    go('review')
  }

  const confirmApply = () => {
    if (applying.current || !branch || !(branch === 'share' ? recipient : target)) return
    applying.current = true
    log(
      'confirmation',
      branch === 'share'
        ? `Share ${file.name} with ${personName(recipient!)} as ${shareRole}`
        : branch === 'restrict'
          ? 'Move file and update access'
          : `Remove ${targetName} from ${sourceName}`,
    )
    go('applying')
    const before = scenario
    timer.current = window.setTimeout(() => {
      applying.current = false
      if (failureMode !== 'off') {
        onFailureUsed()
        log('simulated_failure', 'all-or-nothing: no changes applied')
        go('failed')
        return
      }
      const res =
        branch === 'share'
          ? applyShareFile(before, fileId, recipient!, shareRole)
          : branch === 'restrict'
            ? applyRestrict(before, { ...plan, folderName: folderName.trim() })
            : applyRemoveFromFolder(before, sourceId, target!)
      const newFolderId = branch === 'restrict' ? getItem(res.scenario, fileId).parentId! : undefined
      onCommit(res.scenario)
      setOutcome({
        branch,
        operations: res.operations,
        before,
        after: res.scenario,
        newFolderId,
      })
      log('simulated_success', res.operations.join(' | '))
      go('result')
    }, APPLY_DELAY_MS)
  }

  // ---- Add people (direct file sharing) ----
  const parent = getItem(scenario, fileParentId)
  const parentLimited = isLimited(parent)
  const siblingCount = children(scenario, parent.id).length - 1
  const siblingsText = siblingCount > 1 ? 'the other files' : 'the other file'
  const scopeText = `This shares ${short} only. It does not share the ${parent.name} folder${
    siblingCount > 0 ? ` or ${siblingsText} inside it` : ''
  }.`
  const recipientName = recipient ? personName(recipient) : ''
  const existing = recipient ? access(scenario, fileId, recipient) : null
  const q = query.trim().toLowerCase()
  const matches = q
    ? PEOPLE.filter((p) => p.id !== 'you' && (p.name.toLowerCase().includes(q) || p.email.includes(q)))
    : []
  const active = Math.min(activeOpt, Math.max(matches.length - 1, 0))

  const describeAccess = (p: PersonId) => {
    const a = access(scenario, fileId, p)
    if (!a) return null
    return a.sourceId === fileId
      ? `${a.role} (shared directly)`
      : `${a.role}, from “${getItem(scenario, a.sourceId).name}”`
  }

  const startAdd = () => {
    log('action_selected', `Add people: ${file.name}`)
    setBranch('share')
    setBackFromAdd(false)
    go('add')
  }

  const clearAdd = () => {
    setRecipient(null)
    setShareRole('Viewer')
    setQuery('')
    setAddError(null)
  }

  const backToShare = () => {
    clearAdd()
    setBackFromAdd(true)
    go('share')
  }

  const pickRecipient = (p: PersonId) => {
    if (recipient === p) {
      setAddError(`${personName(p)} is already added.`)
      return
    }
    if (recipient) {
      setAddError(`This prototype shares with one person at a time. Remove ${recipientName} to choose someone else.`)
      return
    }
    setRecipient(p)
    setQuery('')
    setAddError(null)
    const has = describeAccess(p)
    log('recipient_selected', `${personName(p)}${has ? ` — already has access: ${has}` : ''}`)
  }

  const unmatchedError = () =>
    q.includes('@')
      ? `“${query.trim()}” isn’t a study account. Only the study accounts (Maya, Ravi and Alex, @example.com) can be added in this prototype.`
      : `No study account matches “${query.trim()}”.`

  const submitQuery = () => {
    if (matches.length) return pickRecipient(matches[active].id)
    if (!q) return
    const msg = unmatchedError()
    setAddError(msg)
    log('action_selected', `recipient rejected: ${msg}`)
  }

  const continueFromAdd = () => {
    if (!recipient) {
      const msg = q ? unmatchedError() : 'Add a person to share with.'
      setAddError(q && matches.length ? 'Choose a person from the list.' : msg)
      log('action_selected', `Continue blocked: ${msg}`)
      recipientInput.current?.focus()
      return
    }
    if (existing) {
      log('action_selected', `Continue blocked: ${recipientName} already has access`)
      return
    }
    log('review_opened', `share ${file.name} with ${recipientName} as ${shareRole}`)
    go('addReview')
  }

  // The file, everything beside it, its folder, and the rest of the enclosing project.
  const scopeItems = (() => {
    const out = [file, ...children(scenario, fileParentId).filter((i) => i.id !== fileId), parent]
    if (parent.parentId && parent.parentId !== ROOT_ID) {
      const inParent = new Set([parent.id, ...descendants(scenario, parent.id).map((i) => i.id)])
      out.push(
        getItem(scenario, parent.parentId),
        ...descendants(scenario, parent.parentId).filter((i) => !inParent.has(i.id)),
      )
    }
    return out
  })()

  const scopeNote = (
    <section className="access-summary scope-note" aria-label="Sharing scope">
      <LimitedFolderIcon size={18} />
      <p>{scopeText}</p>
    </section>
  )

  const header = (title: string, opts: { closable?: boolean } = {}) => (
    <div className="dialog-header">
      <h2 id="flow-title" tabIndex={-1}>
        {title}
      </h2>
      {opts.closable !== false && (
        <button type="button" className="icon-button" aria-label="Close" onClick={requestClose}>
          <CloseIcon />
        </button>
      )}
    </div>
  )

  const fileChip = (
    <span className="file-chip">
      <ImageIcon size={18} />
      <span>{file.name}</span>
    </span>
  )

  // Who-keeps-access checklist, shared by Version A's people step and Version B's setup.
  /** People checkboxes. Without `explain`, the legend list and callouts are left to the caller (Version B's summary). */
  const keepPeople = (explain?: [string, string]) => {
    const targetKept = target ? !!keep[target] : false
    const unintended = collaborators.filter((p) => p !== target && !keep[p])
    return (
      <>
        <fieldset className="check-group">
          <legend className="visually-hidden">People who keep access to {short}</legend>
          {explain && (
            <ul className="explain-list" id="keep-meaning">
              <li>
                <span aria-hidden="true">☑ </span>
                {explain[0]}
              </li>
              <li>
                <span aria-hidden="true">☐ </span>
                {explain[1]}
              </li>
            </ul>
          )}
          <ul className="people-list">
            {owners.map((p) => (
              <li key={p} className="person-row">
                <input type="checkbox" id={`keep-${p}`} checked disabled aria-describedby={`keep-${p}-desc`} />
                <Avatar id={p} />
                <label className="person-text" htmlFor={`keep-${p}`}>
                  <span className="person-name">{personName(p)} — Owner</span>
                  <span id={`keep-${p}-desc`} className="person-sub">
                    <span aria-hidden="true">🔒 </span>Always keeps access
                  </span>
                </label>
              </li>
            ))}
            {collaborators.map((p) => {
              const role = roleOf(scenario, fileId, p)
              const kept = !!keep[p]
              return (
                <li key={p} className="person-row">
                  <input
                    type="checkbox"
                    id={`keep-${p}`}
                    checked={kept}
                    onChange={(e) => toggleKeep(p, e.target.checked)}
                    aria-describedby={`keep-${p}-desc`}
                  />
                  <Avatar id={p} />
                  <label className="person-text" htmlFor={`keep-${p}`}>
                    <span className="person-name">
                      {personName(p)} — {role}
                    </span>
                    <span id={`keep-${p}-desc`} className={`person-sub ${kept ? 'status-keep' : 'status-lose'}`}>
                      {kept ? (
                        <>
                          <span aria-hidden="true">✓ </span>Keeps access as {role}
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true">✕ </span>Will lose access to {short} after confirmation
                        </>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
        {explain && (
          <div aria-live="polite">
            {target && (
              <div className={`callout ${targetKept ? 'callout-info' : 'callout-ok'}`}>
                {targetKept
                  ? `${targetName} is selected, so ${targetName} will keep access to ${short}.`
                  : `${targetName} will lose access to ${short} after confirmation.`}
              </div>
            )}
            {unintended.length > 0 && (
              <div className="callout callout-warn" role="note">
                <strong>
                  <span aria-hidden="true">⚠ </span>
                  {joinNames(unintended.map(personName))} will also lose access to {short}.
                </strong>{' '}
                Select them again if they should keep it.
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  const draftNote = <p className="footer-note">No files moved or permissions changed yet.</p>

  let body: React.ReactNode
  let escape: (() => void) | undefined = requestClose

  switch (step) {
    case 'share': {
      const people = peopleWithAccess(scenario, fileId)
      const parent = getItem(scenario, file.parentId!)
      body = (
        <>
          <div className="dialog-header share-header">
            <h2 id="flow-title" tabIndex={-1}>
              Share “{file.name}”
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Sharing help"
              onClick={() => onUnavailable('Sharing help')}
            >
              <HelpIcon size={22} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Sharing settings"
              onClick={() => onUnavailable('Sharing settings')}
            >
              <SettingsIcon size={22} />
            </button>
          </div>
          <div className="dialog-body">
            {isLimited(parent) && (
              <div className="share-banner" role="note">
                <InfoIcon size={20} />
                <span>
                  This file is in “{parent.name}”, a folder with limited access. Sharing on{' '}
                  {getItem(scenario, parent.parentId!).name} doesn’t apply to it.
                </span>
              </div>
            )}
            <button type="button" className="add-people" data-autofocus={backFromAdd || undefined} onClick={startAdd}>
              Add people, groups, spaces, and calendar events
            </button>
            <h3 className="section-label">People with access</h3>
            <ul className="people-list">
              {people.map((p) => {
                const a = access(scenario, fileId, p)!
                const inherited = a.sourceId !== fileId && a.role !== 'Owner'
                const roleItems: MenuItem[] = [
                  ...(['Viewer', 'Commenter', 'Editor'] as const).map((r) => ({
                    id: r,
                    label: r,
                    checked: a.role === r,
                    disabled: a.role !== r,
                    description: a.role !== r ? 'Not available in this prototype' : undefined,
                  })),
                  ...(variant === 'B'
                    ? [
                        {
                          id: 'restrict',
                          label: 'Restrict access to this file…',
                          separatorBefore: true,
                          onSelect: () => startRestrict(p),
                        },
                      ]
                    : []),
                  {
                    id: 'remove',
                    label: variant === 'B' ? 'Remove access…' : 'Remove access',
                    separatorBefore: variant !== 'B',
                    onSelect: () => startRemove(p),
                  },
                ]
                return (
                  <li key={p} className="person-row">
                    <Avatar id={p} />
                    <div className="person-text">
                      <span className="person-name">{personName(p)}</span>
                      <span className="person-sub">{PEOPLE.find((x) => x.id === p)!.email}</span>
                      {inherited && (
                        <span className="person-source">
                          <FolderIcon size={14} /> Access from “{getItem(scenario, a.sourceId).name}”
                        </span>
                      )}
                    </div>
                    {a.role === 'Owner' ? (
                      <span className="role-static">Owner</span>
                    ) : (
                      <Menu
                        label={`${personName(p)}'s role: ${a.role}`}
                        buttonClassName="role-button"
                        button={
                          <>
                            {a.role} <CaretIcon />
                          </>
                        }
                        items={roleItems}
                        onOpen={() => log('action_selected', `open role menu: ${personName(p)}`)}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            <h3 className="section-label">General access</h3>
            <div className="general-access">
              <span className="lock-circle" aria-hidden="true">
                <LockIcon size={18} />
              </span>
              <div>
                <div className="person-name">
                  Restricted <CaretIcon size={18} />
                </div>
                <div className="person-sub">Only people with access can open with the link</div>
              </div>
            </div>
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn btn-outline" onClick={() => onUnavailable('Copy link')}>
              <LinkIcon size={18} /> Copy link
            </button>
            <button type="button" className="btn btn-filled" onClick={() => onClose()}>
              Done
            </button>
          </div>
        </>
      )
      escape = () => onClose()
      break
    }

    case 'add': {
      const cancel = () => {
        log('action_selected', 'Cancel (add people)')
        if (recipient) setConfirmDiscard('share')
        else backToShare()
      }
      escape = recipient ? requestClose : cancel
      const blocked = !recipient || !!existing
      body = (
        <>
          {header(`Share “${file.name}”`)}
          {scopeNote}
          <div className="dialog-body">
            <div className="add-row">
              <div className="recipient-field">
                <label className="visually-hidden" htmlFor="recipient">
                  Add people by name or email
                </label>
                {recipient && (
                  <span className="recipient-chip">
                    <Avatar id={recipient} />
                    <span>
                      {recipientName} <span className="muted">{PEOPLE.find((x) => x.id === recipient)!.email}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-button chip-remove"
                      aria-label={`Remove ${recipientName}`}
                      onClick={() => {
                        log('recipient_selected', `removed ${recipientName}`)
                        clearAdd()
                        recipientInput.current?.focus()
                      }}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </span>
                )}
                <input
                  id="recipient"
                  ref={recipientInput}
                  data-autofocus
                  className="recipient-input"
                  role="combobox"
                  autoComplete="off"
                  placeholder={recipient ? '' : 'Add people by name or email'}
                  aria-expanded={matches.length > 0}
                  aria-controls="recipient-options"
                  aria-autocomplete="list"
                  aria-activedescendant={matches.length ? `opt-${matches[active].id}` : undefined}
                  aria-invalid={!!addError}
                  aria-describedby={addError ? 'recipient-error recipient-help' : 'recipient-help'}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveOpt(0)
                    setAddError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && matches.length) {
                      e.preventDefault()
                      setActiveOpt((active + 1) % matches.length)
                    } else if (e.key === 'ArrowUp' && matches.length) {
                      e.preventDefault()
                      setActiveOpt((active - 1 + matches.length) % matches.length)
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      submitQuery()
                    } else if (e.key === 'Escape' && query) {
                      // Clear the suggestions first; a second Escape closes the dialog.
                      e.stopPropagation()
                      setQuery('')
                    }
                  }}
                />
              </div>
              <div className="role-field">
                <label className="field-label" htmlFor="share-role">
                  Role
                </label>
                <select
                  id="share-role"
                  value={shareRole}
                  onChange={(e) => {
                    const r = e.target.value as typeof shareRole
                    setShareRole(r)
                    log('role_selected', `${r} for ${file.name}${recipient ? ` (${recipientName})` : ''}`)
                  }}
                >
                  {SHARE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {matches.length > 0 && (
              <ul id="recipient-options" role="listbox" className="option-list" aria-label="Study accounts">
                {matches.map((p, i) => {
                  const has = describeAccess(p.id)
                  return (
                    <li
                      key={p.id}
                      id={`opt-${p.id}`}
                      role="option"
                      aria-selected={i === active}
                      className="person-row option"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveOpt(i)}
                      onClick={() => pickRecipient(p.id)}
                    >
                      <Avatar id={p.id} />
                      <span className="person-text">
                        <span className="person-name">{p.name}</span>
                        <span className="person-sub">
                          {p.email}
                          {recipient === p.id ? ' · Already added' : has ? ` · Has access: ${has}` : ''}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <p id="recipient-help" className="muted">
              Study accounts only: Maya, Ravi and Alex (@example.com).
            </p>
            {addError && (
              <p id="recipient-error" className="field-error" role="alert">
                <span aria-hidden="true">⚠ </span>
                {addError}
              </p>
            )}
            <div aria-live="polite">
              {recipient && existing && (
                <div className="callout callout-info">
                  {recipientName} already has {existing.role} access to {short}
                  {existing.sourceId === fileId
                    ? ' (shared directly)'
                    : `, from “${getItem(scenario, existing.sourceId).name}”`}
                  . Sharing again wouldn’t add anything, so there’s nothing to share.
                </div>
              )}
              {recipient && !existing && (
                <p className="muted">
                  {recipientName} will be able to open {short} from its link as {shareRole}
                  {parentLimited && !canOpen(scenario, parent.id, recipient)
                    ? `, but still won’t be able to open the ${parent.name} folder${
                        siblingCount > 0 ? ` or ${siblingsText} in it` : ''
                      }.`
                    : '.'}
                </p>
              )}
            </div>
          </div>
          <div className="dialog-footer">
            <p className="footer-note">No changes applied yet.</p>
            <div className="button-row">
              <button type="button" className="btn btn-text" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-filled" aria-disabled={blocked} onClick={continueFromAdd}>
                Continue
              </button>
            </div>
          </div>
        </>
      )
      break
    }

    case 'addReview': {
      if (!recipient) break
      const after = sharePreview?.scenario
      const others = peopleWithAccess(scenario, fileId).filter((p) => p !== recipient)
      const othersUnchanged =
        !!after &&
        others.every((p) => scenario.items.every((i) => roleOf(scenario, i.id, p) === roleOf(after, i.id, p)))
      body = (
        <>
          {header(`Review sharing for ${short}`)}
          {scopeNote}
          <div className="dialog-body">
            <dl className="facts">
              <div>
                <dt>File</dt>
                <dd>{fileChip}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{displayPath(scenario, fileParentId)}</dd>
              </div>
              <div>
                <dt>Person</dt>
                <dd>
                  {recipientName} <span className="muted">{PEOPLE.find((x) => x.id === recipient)!.email}</span>
                </dd>
              </div>
              <div>
                <dt>Planned role</dt>
                <dd>{shareRole}</dd>
              </div>
            </dl>
            <table className="access-table">
              <caption className="section-label">{recipientName}’s access before and after</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {scopeItems.map((i) => {
                  const was = roleOf(scenario, i.id, recipient)
                  const now = after ? roleOf(after, i.id, recipient) : null
                  return (
                    <tr key={i.id} className={was !== now ? 'row-changed' : ''}>
                      <th scope="row">
                        {i.name}
                        {i.kind === 'folder' && <span className="muted"> folder</span>}
                      </th>
                      <td>
                        <AccessBadge role={was} />
                      </td>
                      <td>
                        <AccessBadge role={now} />
                        {was === now && <span className="muted"> (unchanged)</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {othersUnchanged && others.length > 0 && (
              <p className="muted">
                {joinNames(others.map((p) => `${personName(p)} (${roleOf(scenario, fileId, p)})`))} keep their current
                access.
              </p>
            )}
            <p className="footer-note">Nothing has changed yet. Sharing happens only after you confirm.</p>
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn btn-text" onClick={() => go('add')}>
              Back
            </button>
            <button type="button" className="btn btn-filled" onClick={confirmApply} disabled={!after}>
              Share {short}
            </button>
          </div>
        </>
      )
      break
    }

    case 'decide': {
      const cancel = () => {
        log('action_selected', 'Cancel (decision)')
        go('share')
      }
      escape = cancel
      body = (
        <>
          {header(`Change ${targetName}’s access`, { closable: false })}
          <div className="dialog-body">
            <p>
              {targetName} has access to this file through {sourceName}.
            </p>
            <div className="choice-list">
              <button type="button" className="choice" data-autofocus onClick={() => chooseBranch('project')}>
                <span className="choice-title">Remove access to the project</span>
                <span className="choice-desc">
                  Review removing {targetName} from {sourceName} and its inherited content.
                </span>
              </button>
              <button type="button" className="choice" onClick={() => chooseBranch('restrict')}>
                <span className="choice-title">Keep project access, restrict this file</span>
                <span className="choice-desc">
                  Move {short} to a limited-access folder and choose who keeps access.
                </span>
              </button>
            </div>
          </div>
          <div className="dialog-footer">
            <span />
            <button type="button" className="btn btn-text" onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      )
      break
    }

    case 'removeReview': {
      const lost = removalPreview?.lost ?? []
      const others = PEOPLE.map((p) => p.id).filter((p) => p !== target && canOpen(scenario, sourceId, p))
      body = (
        <>
          {header(`Remove ${targetName} from ${sourceName}?`)}
          <div className="dialog-body">
            <p>
              {targetName} will lose {roleOf(scenario, sourceId, target!)} access to {sourceName} and to everything that
              inherits access from it.
            </p>
            <div className="callout callout-warn" role="note">
              <strong>
                After confirmation, {targetName} won’t be able to open{' '}
                {lost.length === 1 ? 'this item' : `these ${lost.length} items`}:
              </strong>
              <ul className="plain-list">
                {lost.map((i) => (
                  <li key={i.id}>
                    <span aria-hidden="true">✕ </span>
                    {i.name}
                    {i.kind === 'folder' ? ' (folder)' : ''}
                  </li>
                ))}
              </ul>
            </div>
            {others.length > 0 && (
              <p className="muted">
                {others.map((p) => `${personName(p)} (${roleOf(scenario, sourceId, p)})`).join(', ')} keep their current
                access.
              </p>
            )}
            <p className="footer-note">No changes applied yet.</p>
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn btn-text" onClick={() => go('decide')}>
              Back
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmApply}>
              Remove {targetName} from {sourceName}
            </button>
          </div>
        </>
      )
      break
    }

    case 'destination': {
      const showErrors = destAttempted
      const parentName = getItem(scenario, fileParentId).name
      body = (
        <>
          {header(`Choose a folder for ${short}`)}
          <div className="dialog-body">
            <p>Choose where this file will move. Review access before confirming.</p>
            <dl className="facts">
              <div>
                <dt>File</dt>
                <dd>{fileChip}</dd>
              </div>
              <div>
                <dt>Current location</dt>
                <dd>{displayPath(scenario, fileParentId)}</dd>
              </div>
            </dl>
            <fieldset
              className="radio-group"
              aria-describedby={showErrors && destMode === null ? 'dest-error' : undefined}
            >
              <legend className="section-label">Destination</legend>
              <label className="radio-row">
                <input
                  type="radio"
                  name="dest"
                  checked={destMode === 'existing'}
                  onChange={() => {
                    setDestMode('existing')
                    log('destination_chosen', 'option: existing limited-access folder')
                  }}
                />
                <span>Use an existing limited-access folder</span>
              </label>
              {destMode === 'existing' && (
                <div className="radio-detail">
                  <p role="status">
                    {limitedFolders.length === 0
                      ? `No limited-access folders are available in ${parentName}.`
                      : `Moving into an existing limited-access folder isn't available in this prototype.`}
                  </p>
                  <button
                    type="button"
                    className="btn btn-tonal"
                    onClick={() => {
                      setDestMode('new')
                      log('destination_chosen', 'option: create new (via “Create a new folder”)')
                      requestAnimationFrame(() => nameInput.current?.focus())
                    }}
                  >
                    Create a new folder
                  </button>
                </div>
              )}
              <label className="radio-row">
                <input
                  type="radio"
                  name="dest"
                  checked={destMode === 'new'}
                  onChange={() => {
                    setDestMode('new')
                    log('destination_chosen', 'option: create new limited-access folder')
                  }}
                />
                <span>Create a new limited-access folder</span>
              </label>
              {destMode === 'new' && (
                <div className="radio-detail">
                  <label className="field-label" htmlFor="folder-name">
                    Folder name
                  </label>
                  <input
                    id="folder-name"
                    ref={nameInput}
                    className={`text-input ${nameError ? 'invalid' : ''}`}
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'folder-name-error' : 'folder-location'}
                    onKeyDown={(e) => e.key === 'Enter' && continueFromDestination()}
                  />
                  {nameError && (
                    <p id="folder-name-error" className="field-error" role="alert">
                      <span aria-hidden="true">⚠ </span>
                      {nameError}
                    </p>
                  )}
                  <p id="folder-location" className="muted">
                    Location: {displayPath(scenario, fileParentId)}
                  </p>
                </div>
              )}
            </fieldset>
            {showErrors && destError && destMode !== 'new' && (
              <p id="dest-error" className="field-error" role="alert">
                <span aria-hidden="true">⚠ </span>
                {destError}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            {draftNote}
            <div className="button-row">
              <button type="button" className="btn btn-text" onClick={() => go('decide')}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-filled"
                aria-disabled={!!destError}
                onClick={continueFromDestination}
              >
                Continue
              </button>
            </div>
          </div>
        </>
      )
      break
    }

    case 'setup': {
      const parentName = getItem(scenario, fileParentId).name
      // Planned outcome of the current selections; nothing here is applied until confirmation.
      const losers = collaborators.filter((p) => !keep[p])
      const otherKeepers = collaborators.filter((p) => p !== target && keep[p])
      const summary: { tone: 'keep' | 'lose' | 'same'; text: string }[] = []
      if (losers.length === 0) {
        summary.push({ tone: 'keep', text: `Everyone will keep access to ${short}.` })
      } else {
        if (target && keep[target]) summary.push({ tone: 'keep', text: `${targetName} will keep access to ${short}.` })
        summary.push({ tone: 'lose', text: `${joinNames(losers.map(personName))} will lose access to ${short}.` })
        if (otherKeepers.length > 0)
          summary.push({ tone: 'keep', text: `${joinNames(otherKeepers.map(personName))} will keep access.` })
      }
      summary.push({ tone: 'same', text: `Access to the rest of ${parentName} stays unchanged.` })
      const summaryIcon = { keep: '✓', lose: '✕', same: '=' }
      body = (
        <>
          {header(`Restrict access to ${short}`)}
          <section className="access-summary" aria-labelledby="setup-summary">
            <h3 id="setup-summary" className="visually-hidden">
              Planned access after you confirm
            </h3>
            <ul aria-live="polite" aria-atomic="true">
              {summary.map((s) => (
                <li key={s.text}>
                  <span aria-hidden="true" className={`summary-icon status-${s.tone}`}>
                    {summaryIcon[s.tone]}
                  </span>
                  {s.text}
                </li>
              ))}
            </ul>
          </section>
          <div className="dialog-body">
            <section className="setup-section" aria-labelledby="setup-dest">
              <h3 id="setup-dest" className="section-label">
                Move {file.name} into a new limited-access folder
              </h3>
              <p id="folder-location" className="muted">
                Inside: {displayPath(scenario, fileParentId)}
              </p>
              <div className="inline-field">
                <label className="field-label" htmlFor="folder-name">
                  Folder name
                </label>
                <input
                  id="folder-name"
                  ref={nameInput}
                  className={`text-input ${nameError ? 'invalid' : ''}`}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'folder-name-error folder-location' : 'folder-location'}
                  onKeyDown={(e) => e.key === 'Enter' && reviewFromSetup()}
                />
              </div>
              {nameError && (
                <p id="folder-name-error" className="field-error" role="alert">
                  <span aria-hidden="true">⚠ </span>
                  {nameError}
                </p>
              )}
              <button
                type="button"
                className="disclosure"
                aria-expanded={existingOpen}
                aria-controls="existing-folders"
                onClick={() => {
                  setExistingOpen(!existingOpen)
                  if (!existingOpen) log('destination_chosen', 'option: show existing limited-access folders')
                }}
              >
                <CaretIcon /> Use an existing limited-access folder instead
              </button>
              {existingOpen && (
                <div id="existing-folders" className="radio-detail">
                  <p role="status">
                    {limitedFolders.length === 0
                      ? `No limited-access folders are available in ${parentName}.`
                      : `Moving into an existing limited-access folder isn't available in this prototype.`}
                  </p>
                </div>
              )}
            </section>
            <section className="setup-section" aria-labelledby="setup-people">
              <h3 id="setup-people" className="section-label">
                Who keeps access
              </h3>
              {keepPeople()}
              <p className="muted">Selected teammates will receive access to the new folder.</p>
            </section>
          </div>
          <div className="dialog-footer">
            <p className="footer-note">No changes applied yet.</p>
            <div className="button-row">
              <button type="button" className="btn btn-text" onClick={requestClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-filled" aria-disabled={!!nameError} onClick={reviewFromSetup}>
                Review changes
              </button>
            </div>
          </div>
        </>
      )
      break
    }

    case 'people': {
      body = (
        <>
          {header(`Who can open ${short}?`)}
          <div className="dialog-body">
            <p>Choose who should keep access after this file moves.</p>
            {keepPeople([
              `Selected people will keep access to ${short}.`,
              `Unselected people will lose access to ${short} after confirmation.`,
            ])}
            <p className="muted">
              The people you select can open {short} with the same role they have now. Access to the rest of{' '}
              {getItem(scenario, fileParentId).name} doesn’t change.
            </p>
          </div>
          <div className="dialog-footer">
            {draftNote}
            <div className="button-row">
              <button type="button" className="btn btn-text" onClick={() => go('destination')}>
                Back
              </button>
              <button type="button" className="btn btn-filled" onClick={openReview}>
                Review changes
              </button>
            </div>
          </div>
        </>
      )
      break
    }

    case 'review': {
      const parentName = getItem(scenario, fileParentId).name
      const name = folderName.trim()
      const rows = peopleWithAccess(scenario, fileId)
      const after = preview?.scenario
      body = (
        <>
          {header('Review access changes')}
          <div className="dialog-body">
            <dl className="facts">
              <div>
                <dt>File</dt>
                <dd>{fileChip}</dd>
              </div>
              <div>
                <dt>Current location</dt>
                <dd>{displayPath(scenario, fileParentId)}</dd>
              </div>
              <div>
                <dt>Proposed location</dt>
                <dd>
                  {displayPath(scenario, fileParentId)} / {name}
                </dd>
              </div>
            </dl>
            <p className="muted">
              <LimitedFolderIcon size={16} /> The new folder “{name}” has limited access and will contain only{' '}
              {file.name}.
            </p>
            <table className="access-table">
              <caption className="section-label">Access before and after</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">{short} before</th>
                  <th scope="col">{short} after</th>
                  <th scope="col">Rest of project</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p}>
                    <th scope="row">{personName(p)}</th>
                    <td>
                      <AccessBadge role={roleOf(scenario, fileId, p)} />
                    </td>
                    <td>
                      <AccessBadge role={after ? roleOf(after, fileId, p) : null} />
                    </td>
                    <td>
                      <AccessBadge role={roleOf(scenario, fileParentId, p)} />{' '}
                      <span className="muted">(unchanged)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="section-label">What will happen</h3>
            <ul className="effects-list">
              <li>
                <span aria-hidden="true">→ </span>
                {file.name} moves to {displayPath(scenario, fileParentId)} / {name}, a new folder that only the people
                below can open.
              </li>
              {rows.map((p) => {
                const was = roleOf(scenario, fileId, p)
                const now = after ? roleOf(after, fileId, p) : null
                return (
                  <li key={p} className={now ? '' : 'effect-lose'}>
                    <span aria-hidden="true">{now ? '✓ ' : '✕ '}</span>
                    {p === 'you'
                      ? `You stay the owner of ${short}.`
                      : now
                        ? `${personName(p)} keeps ${now} access to ${short}.`
                        : `${personName(p)} will no longer be able to open ${short}. ${personName(p)}’s ${was} access to ${parentName} stays.`}
                  </li>
                )
              })}
              <li>
                <span aria-hidden="true">= </span>
                Everything else in {parentName} stays as it is, including who can open it.
              </li>
            </ul>
            <p className="footer-note">Nothing has changed yet. Changes happen only after you confirm.</p>
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              className="btn btn-text"
              onClick={() => go(restrictEntry === 'setup' ? 'setup' : 'people')}
            >
              Back
            </button>
            <button type="button" className="btn btn-filled" onClick={confirmApply} disabled={!preview}>
              Move file and update access
            </button>
          </div>
        </>
      )
      break
    }

    case 'applying':
      escape = undefined
      body = (
        <>
          {header('Applying changes…', { closable: false })}
          <div className="dialog-body applying" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Updating access. Please wait.</p>
          </div>
          <div className="dialog-footer">
            <span />
            <button type="button" className="btn btn-filled" disabled>
              {branch === 'share'
                ? `Share ${short}`
                : branch === 'restrict'
                  ? 'Move file and update access'
                  : `Remove ${targetName} from ${sourceName}`}
            </button>
          </div>
        </>
      )
      break

    case 'failed':
      body = (
        <>
          {header('Changes couldn’t be applied')}
          <div className="dialog-body">
            <p role="alert">Nothing changed. Try again.</p>
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              className="btn btn-text"
              onClick={() => go(branch === 'project' ? 'removeReview' : branch === 'share' ? 'addReview' : 'review')}
            >
              Back to review
            </button>
            <button type="button" className="btn btn-filled" data-autofocus onClick={confirmApply}>
              Retry
            </button>
          </div>
        </>
      )
      break

    case 'result':
    case 'summary': {
      if (!outcome) break
      const { before, after } = outcome
      if (outcome.branch === 'share' && recipient) {
        const role = roleOf(after, fileId, recipient)
        // Everything except the recipient's cell for this file must match the starting state.
        const restUnchanged = PEOPLE.every((p) =>
          before.items.every(
            (i) => (i.id === fileId && p.id === recipient) || roleOf(before, i.id, p.id) === roleOf(after, i.id, p.id),
          ),
        )
        const copyLink = async () => {
          log('action_selected', `Copy file link: ${file.name} (no permission change)`)
          try {
            await navigator.clipboard.writeText(studyLink(fileId))
            onNotice(`Link to ${file.name} copied. Sharing didn’t change.`)
          } catch {
            onNotice('Couldn’t copy the link. Sharing didn’t change.')
          }
        }
        body = (
          <>
            {header(`${short} shared with ${recipientName}`)}
            <div className="dialog-body">
              <p className="outcome-line">
                <strong>
                  {role ? `${recipientName} can open ${short} as ${role}.` : `${recipientName} can’t open ${short}.`}
                </strong>
              </p>
              {restUnchanged && (
                <p>
                  {parentLimited
                    ? siblingCount > 0
                      ? 'Other private files and folder access were not changed.'
                      : `Access to the ${parent.name} folder was not changed.`
                    : 'Access to other files and folders was not changed.'}
                </p>
              )}
              {parentLimited && !canOpen(after, parent.id, recipient) && (
                <p className="muted">
                  {recipientName} opens {short} from its link. {recipientName} still can’t open the {parent.name}{' '}
                  folder.
                </p>
              )}
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn btn-outline" onClick={copyLink}>
                <LinkIcon size={18} /> Copy file link
              </button>
              <button type="button" className="btn btn-filled" data-autofocus onClick={() => onClose()}>
                Done
              </button>
            </div>
          </>
        )
        escape = () => onClose()
        break
      }
      if (!target) break
      const returnBtn = (
        <button type="button" className="btn btn-filled" onClick={() => onClose(fileParentId)}>
          Return to project
        </button>
      )
      if (step === 'summary') {
        const items = [getItem(after, fileParentId), ...descendants(after, fileParentId)]
        body = (
          <>
            {header('Access summary')}
            <div className="dialog-body">
              <table className="access-table">
                <caption className="section-label">Current access in {getItem(after, fileParentId).name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {items.map((i) => (
                      <th key={i.id} scope="col">
                        {i.id === fileParentId
                          ? `${i.name} (project)`
                          : displayPath(after, i.id).split(' / ').slice(1).join(' / ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PEOPLE.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{p.name}</th>
                      {items.map((i) => (
                        <td key={i.id}>
                          <AccessBadge role={roleOf(after, i.id, p.id)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn btn-text" onClick={() => go('result')}>
                Back
              </button>
              {returnBtn}
            </div>
          </>
        )
        escape = () => onClose(fileParentId)
        break
      }
      const targetAfter = roleOf(after, fileId, target)
      const projectUnchanged = PEOPLE.every(
        (p) => roleOf(before, fileParentId, p.id) === roleOf(after, fileParentId, p.id),
      )
      const lost = outcome.branch === 'project' ? lostAccess(before, after, sourceId, target) : []
      body = (
        <>
          {header(
            outcome.branch === 'restrict'
              ? 'File moved and access updated'
              : `${targetName} removed from ${sourceName}`,
          )}
          <div className="dialog-body">
            <h3 className="section-label">Completed</h3>
            <ul className="plain-list done-list">
              {outcome.operations.map((op) => (
                <li key={op}>
                  <span aria-hidden="true">✓ </span>
                  {op}
                </li>
              ))}
            </ul>
            {outcome.branch === 'restrict' ? (
              <>
                <dl className="facts">
                  <div>
                    <dt>{file.name} is now in</dt>
                    <dd>
                      {displayPath(after, outcome.newFolderId!)} <span className="muted">(limited access)</span>
                    </dd>
                  </div>
                </dl>
                <table className="access-table">
                  <caption className="section-label">Who can open {file.name}</caption>
                  <tbody>
                    {PEOPLE.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{p.name}</th>
                        <td>
                          <AccessBadge role={roleOf(after, fileId, p.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="outcome-line">
                  <strong>
                    {targetAfter
                      ? `${targetName} can open ${file.name} (${targetAfter}).`
                      : `${targetName} can’t open ${file.name}.`}
                  </strong>
                </p>
                {projectUnchanged && <p>Access to {getItem(after, fileParentId).name} was not changed.</p>}
              </>
            ) : (
              <>
                <p className="outcome-line">
                  <strong>
                    {targetName} can no longer open: {lost.map((i) => i.name).join(', ')}.
                  </strong>
                </p>
                <p className="muted">Other people’s access was not changed.</p>
              </>
            )}
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn btn-text" onClick={() => go('summary')}>
              View access summary
            </button>
            {returnBtn}
          </div>
        </>
      )
      escape = () => onClose(fileParentId)
      break
    }
  }

  return (
    <>
      <Modal
        labelledBy="flow-title"
        onEscape={confirmDiscard ? undefined : escape}
        focusKey={step}
        size={step === 'summary' || step === 'review' ? 'lg' : 'md'}
      >
        {body}
      </Modal>
      {confirmDiscard && (
        <Modal
          labelledBy="discard-title"
          describedBy="discard-desc"
          role="alertdialog"
          size="sm"
          onEscape={() => setConfirmDiscard(null)}
        >
          <div className="dialog-header">
            <h2 id="discard-title" tabIndex={-1}>
              Discard changes?
            </h2>
          </div>
          <div className="dialog-body">
            <p id="discard-desc">Your choices for {file.name} haven’t been applied and will be lost.</p>
          </div>
          <div className="dialog-footer">
            <span />
            <div className="button-row">
              <button type="button" className="btn btn-text" data-autofocus onClick={() => setConfirmDiscard(null)}>
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-filled"
                onClick={() => {
                  log('action_selected', `discard draft from ${step}`)
                  if (confirmDiscard === 'share') {
                    setConfirmDiscard(null)
                    backToShare()
                  } else onClose()
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
