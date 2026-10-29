import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './App.css'
import { Menu, type MenuItem } from './components/Menu'
import { Modal } from './components/Modal'
import {
  AppsIcon,
  ArrowDownIcon,
  BrandMark,
  BulbIcon,
  CalendarIcon,
  CaretIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  CloudIcon,
  ComputerIcon,
  ContactIcon,
  DotsIcon,
  DownloadIcon,
  EditIcon,
  FolderIcon,
  GridIcon,
  HelpIcon,
  HomeIcon,
  ImageIcon,
  InfoIcon,
  LimitedFolderIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  MoveIcon,
  MyDriveIcon,
  OpenIcon,
  PeopleIcon,
  PersonAddIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SpamIcon,
  StarIcon,
  TaskIcon,
  TrashIcon,
  TuneIcon,
} from './components/Icons'
import { ShareFlow, type FailureMode } from './flow/ShareFlow'
import { Facilitator } from './Facilitator'
import {
  PROJECT_ID,
  ROOT_ID,
  canOpen,
  children,
  descendants,
  displayPath,
  getItem,
  initialScenario,
  isLimited,
  path,
  peopleWithAccess,
  personName,
  roleOf,
  type Item,
  type PersonId,
  type Scenario,
} from './model'
import type { EventType, LogEntry, Variant } from './log'

type Mode = 'participant' | 'facilitator'
type Section = 'home' | 'drive' | 'computers' | 'shared' | 'recent' | 'starred' | 'spam' | 'trash'

const readMode = (): Mode =>
  new URLSearchParams(location.search).get('mode') === 'facilitator' ? 'facilitator' : 'participant'

function writeMode(mode: Mode) {
  const url = new URL(location.href)
  if (mode === 'facilitator') url.searchParams.set('mode', 'facilitator')
  else url.searchParams.delete('mode')
  history.replaceState(null, '', url)
}

// Version A is the default; anything other than ?variant=B means A.
const readVariant = (): Variant =>
  new URLSearchParams(location.search).get('variant')?.toUpperCase() === 'B' ? 'B' : 'A'

function writeVariant(variant: Variant) {
  const url = new URL(location.href)
  url.searchParams.set('variant', variant)
  history.replaceState(null, '', url)
}

// Each variant keeps its own scenario so outcomes in one never leak into the other.
const initialScenarios = (): Record<Variant, Scenario> => ({ A: initialScenario(), B: initialScenario() })

// Mock metadata for display only.
const SIZES: Record<string, string> = {
  'file-a': '1.2 MB',
  'file-b': '864 KB',
}
const sizeOf = (item: Item) => (item.kind === 'folder' ? '—' : (SIZES[item.id] ?? '—'))
const MODIFIED = 'Oct 29, 2026'

const MOCK_SECTIONS: Record<Exclude<Section, 'drive'>, { title: string; empty: string }> = {
  home: {
    title: 'Welcome to Drive',
    empty: 'Suggestions aren’t simulated in this prototype.',
  },
  computers: {
    title: 'Computers',
    empty: 'No computers are syncing in this prototype.',
  },
  shared: {
    title: 'Shared with me',
    empty: 'Nothing has been shared with you in this prototype.',
  },
  recent: {
    title: 'Recent',
    empty: 'Recent activity isn’t simulated in this prototype.',
  },
  starred: { title: 'Starred', empty: 'No starred files.' },
  spam: { title: 'Spam', empty: 'No spam files.' },
  trash: { title: 'Trash', empty: 'Trash is empty.' },
}

const itemIcon = (item: Item, size = 24) =>
  item.kind === 'file' ? (
    <ImageIcon size={size} />
  ) : isLimited(item) ? (
    <LimitedFolderIcon size={size} />
  ) : (
    <FolderIcon size={size} />
  )

export default function App() {
  const [mode, setMode] = useState<Mode>(readMode)
  const [variant, setVariant] = useState<Variant>(readVariant)
  const [scenarios, setScenarios] = useState(initialScenarios)
  const scenario = scenarios[variant]
  const [viewer, setViewer] = useState<PersonId>('you')
  const [section, setSection] = useState<Section>('drive')
  const [folderId, setFolderId] = useState(PROJECT_ID)
  const [flow, setFlow] = useState<{ fileId: string; key: number; variant: Variant } | null>(null)
  const [opened, setOpened] = useState<{ itemId: string; ok: boolean } | null>(null)
  const [failureMode, setFailureMode] = useState<FailureMode>('off')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [details, setDetails] = useState(false)
  const [rail, setRail] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const launchRef = useRef<HTMLButtonElement>(null)
  const drawerWasOpen = useRef(false)
  useEffect(() => {
    // Return focus to the launcher when the drawer closes (not on first render).
    if (!drawer && drawerWasOpen.current) launchRef.current?.focus()
    drawerWasOpen.current = drawer
  }, [drawer])
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)

  const start = useRef(0)
  const seq = useRef(1)
  const ctx = useRef({ viewer, mode, variant })
  useLayoutEffect(() => {
    ctx.current = { viewer, mode, variant }
  })
  useEffect(() => {
    start.current = performance.now()
  }, [])
  const [log, setLog] = useState<LogEntry[]>(() => [
    {
      seq: 0,
      elapsedMs: 0,
      type: 'screen_opened',
      detail: 'file list: Client Project',
      viewer: 'you',
      mode: readMode(),
      variant: readVariant(),
    },
  ])

  const addLog = useCallback((type: EventType, detail: string) => {
    const entry: LogEntry = {
      seq: seq.current++,
      elapsedMs: Math.round(performance.now() - start.current),
      type,
      detail,
      viewer: ctx.current.viewer,
      mode: ctx.current.mode,
      variant: ctx.current.variant,
    }
    setLog((l) => [...l, entry])
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  /** Honest stub for controls outside the study task: never pretend it worked. */
  const unavailable = useCallback(
    (what: string) => {
      addLog('action_selected', `unavailable: ${what}`)
      setToast({
        text: `${what} isn’t available in this prototype.`,
        key: Date.now(),
      })
    },
    [addLog],
  )

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next)
      writeMode(next)
      if (next === 'participant') {
        setViewer('you')
        setDrawer(false)
      }
      addLog('facilitator', `mode → ${next}`)
    },
    [addLog],
  )

  // Hidden shortcut so a facilitator can leave participant mode without visible controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault()
        switchMode(ctx.current.mode === 'facilitator' ? 'participant' : 'facilitator')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [switchMode])

  const rootLabel = viewer === 'you' ? 'My Drive' : 'Shared with me'
  const rootSection: Section = viewer === 'you' ? 'drive' : 'shared'

  const navigate = (id: string) => {
    setSection('drive')
    setFolderId(id)
    setSelected(null)
    setQuery('')
    addLog('screen_opened', `file list: ${id === ROOT_ID ? rootLabel : getItem(scenario, id).name}`)
  }

  const goSection = (s: Section) => {
    if (s === rootSection) return navigate(ROOT_ID)
    setSection(s)
    setSelected(null)
    setQuery('')
    addLog('screen_opened', `sidebar: ${s === 'drive' ? 'My Drive' : MOCK_SECTIONS[s].title}`)
  }

  const openItem = (item: Item, as: PersonId = viewer) => {
    const ok = canOpen(scenario, item.id, as)
    addLog(
      'file_open_attempt',
      `${item.name} as ${personName(as)} → ${ok ? `opened (${roleOf(scenario, item.id, as)})` : 'You need access'}`,
    )
    if (item.kind === 'folder' && ok) {
      navigate(item.id)
      return
    }
    setOpened({ itemId: item.id, ok })
  }

  const openShare = (item: Item) => {
    addLog('action_selected', `Share: ${item.name}`)
    addLog('screen_opened', `share (${item.name})`)
    setFlow({ fileId: item.id, key: seq.current, variant })
  }

  const reset = () => {
    setScenarios(initialScenarios())
    setViewer('you')
    setSection('drive')
    setFolderId(PROJECT_ID)
    setFlow(null)
    setOpened(null)
    setFailureMode('off')
    setView('list')
    setSelected(null)
    setQuery('')
    setDetails(false)
    setRail(true)
    setToast(null)
    start.current = performance.now()
    seq.current = 0
    setLog([])
  }

  // Facilitator only. Closes any open flow (its draft belongs to the old variant).
  const switchVariant = (next: Variant) => {
    if (next === variant) return
    setVariant(next)
    writeVariant(next)
    ctx.current = { ...ctx.current, variant: next }
    setFlow(null)
    setOpened(null)
    setSection('drive')
    setFolderId(PROJECT_ID)
    setSelected(null)
    setQuery('')
    addLog('facilitator', `variant → ${next}`)
  }

  const searching = query.trim() !== ''
  const inDrive = section === 'drive' || section === rootSection
  const folderOk = folderId === ROOT_ID || canOpen(scenario, folderId, viewer)
  const visible = (i: Item) => viewer === 'you' || canOpen(scenario, i.id, viewer)
  const items = searching
    ? descendants(scenario, ROOT_ID).filter(
        (i) => visible(i) && i.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : children(scenario, folderId).filter((i) => folderId !== ROOT_ID || visible(i))
  const crumbs = path(scenario, folderId)
  const currentName = folderId === ROOT_ID ? rootLabel : getItem(scenario, folderId).name
  const selectedItem = selected ? scenario.items.find((i) => i.id === selected) : undefined
  const detailsItem = selectedItem ?? (inDrive && !searching ? getItem(scenario, folderId) : undefined)

  const rowMenu = (item: Item): MenuItem[] => {
    const canShare = viewer === 'you' && item.kind === 'file'
    return [
      {
        id: 'open',
        label: 'Open',
        icon: <OpenIcon size={20} />,
        onSelect: () => openItem(item),
      },
      {
        id: 'download',
        label: 'Download',
        icon: <DownloadIcon />,
        onSelect: () => unavailable('Download'),
      },
      {
        id: 'rename',
        label: 'Rename',
        icon: <EditIcon />,
        onSelect: () => unavailable('Rename'),
      },
      {
        id: 'share',
        label: 'Share',
        icon: <PersonAddIcon />,
        separatorBefore: true,
        onSelect: () =>
          canShare ? openShare(item) : unavailable(`Sharing ${item.kind === 'folder' ? 'folders' : 'as this person'}`),
      },
      {
        id: 'copy',
        label: 'Copy link',
        icon: <LinkIcon />,
        onSelect: () => unavailable('Copy link'),
      },
      {
        id: 'organize',
        label: 'Organize',
        icon: <MoveIcon />,
        onSelect: () => unavailable('Organize'),
      },
      {
        id: 'info',
        label: `${item.kind === 'folder' ? 'Folder' : 'File'} information`,
        icon: <InfoIcon size={20} />,
        onSelect: () => {
          setSelected(item.id)
          setDetails(true)
          addLog('action_selected', `details: ${item.name}`)
        },
      },
      {
        id: 'trash',
        label: 'Move to trash',
        icon: <TrashIcon />,
        separatorBefore: true,
        onSelect: () => unavailable('Move to trash'),
      },
    ]
  }

  const select = (item: Item) => {
    setSelected(item.id)
    addLog('action_selected', `select: ${item.name}`)
  }

  const rowKey = (item: Item) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      openItem(item)
    }
  }

  const ownerCell = (
    <span className="owner">
      <span className="avatar avatar-you avatar-xs" aria-hidden="true">
        Y
      </span>
      {viewer === 'you' ? 'me' : 'You'}
    </span>
  )

  const navItems: {
    id: Section | 'storage'
    label: string
    icon: ReactNode
    gap?: boolean
  }[] = [
    { id: 'home', label: 'Home', icon: <HomeIcon /> },
    { id: 'drive', label: 'My Drive', icon: <MyDriveIcon /> },
    { id: 'computers', label: 'Computers', icon: <ComputerIcon /> },
    { id: 'shared', label: 'Shared with me', icon: <PeopleIcon />, gap: true },
    { id: 'recent', label: 'Recent', icon: <ClockIcon /> },
    { id: 'starred', label: 'Starred', icon: <StarIcon /> },
    { id: 'spam', label: 'Spam', icon: <SpamIcon />, gap: true },
    { id: 'trash', label: 'Trash', icon: <TrashIcon /> },
    { id: 'storage', label: 'Storage', icon: <CloudIcon /> },
  ]

  const navActive = (id: Section | 'storage') => (inDrive ? id === rootSection : id === section)

  let content: ReactNode
  if (!inDrive) {
    const m = MOCK_SECTIONS[section as Exclude<Section, 'drive'>]
    content = (
      <>
        <div className="main-head">
          <h1 id="page-heading" tabIndex={-1} className="page-title">
            {m.title}
          </h1>
        </div>
        <div className="empty-state">
          <div className="empty-art" aria-hidden="true">
            {navItems.find((n) => n.id === section)?.icon}
          </div>
          <h2>{m.empty}</h2>
          <p>This study uses the files in {rootLabel} › Client Project.</p>
          <button type="button" className="btn btn-tonal" onClick={() => navigate(PROJECT_ID)}>
            Go to Client Project
          </button>
        </div>
      </>
    )
  } else {
    const heading = searching ? (
      <h1 id="page-heading" tabIndex={-1} className="page-title">
        Search results
      </h1>
    ) : (
      <nav aria-label="Location" className="crumbs">
        <ol>
          {crumbs.map((c, idx) => {
            const label = c.id === ROOT_ID ? rootLabel : c.name
            return (
              <li key={c.id}>
                {idx < crumbs.length - 1 ? (
                  <>
                    <button type="button" className="crumb" onClick={() => navigate(c.id)}>
                      {label}
                    </button>
                    <ChevronRightIcon size={24} />
                  </>
                ) : (
                  <div className="crumb-current">
                    <h1 id="page-heading" tabIndex={-1} className="crumb current">
                      {label}
                    </h1>
                    {c.id !== ROOT_ID && (
                      <Menu
                        label={`${label} folder actions`}
                        buttonClassName="icon-button crumb-caret"
                        button={<CaretIcon size={24} />}
                        align="start"
                        onOpen={() => addLog('action_selected', `open folder menu: ${label}`)}
                        items={[
                          {
                            id: 'new',
                            label: 'New folder',
                            icon: <PlusIcon size={20} />,
                            onSelect: () => unavailable('Creating folders here'),
                          },
                          {
                            id: 'share',
                            label: 'Share',
                            icon: <PersonAddIcon />,
                            onSelect: () => unavailable('Sharing folders'),
                          },
                          {
                            id: 'info',
                            label: 'Folder information',
                            icon: <InfoIcon size={20} />,
                            onSelect: () => {
                              setSelected(null)
                              setDetails(true)
                            },
                          },
                        ]}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    )

    const toolbar = selectedItem ? (
      <div className="selection-bar" role="toolbar" aria-label="Selected item actions">
        <button type="button" className="icon-button" aria-label="Clear selection" onClick={() => setSelected(null)}>
          <CloseIcon />
        </button>
        <span className="selection-count">1 selected</span>
        <button
          type="button"
          className="icon-button"
          aria-label={`Share ${selectedItem.name}`}
          onClick={() =>
            viewer === 'you' && selectedItem.kind === 'file'
              ? openShare(selectedItem)
              : unavailable(`Sharing ${selectedItem.kind === 'folder' ? 'folders' : 'as this person'}`)
          }
        >
          <PersonAddIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Download" onClick={() => unavailable('Download')}>
          <DownloadIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Move" onClick={() => unavailable('Move')}>
          <MoveIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Move to trash"
          onClick={() => unavailable('Move to trash')}
        >
          <TrashIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Copy link" onClick={() => unavailable('Copy link')}>
          <LinkIcon />
        </button>
        <Menu
          label={`More actions for ${selectedItem.name}`}
          button={<DotsIcon />}
          align="start"
          items={rowMenu(selectedItem)}
        />
      </div>
    ) : (
      <div className="filters" role="group" aria-label="Filters">
        {['Type', 'People', 'Modified', 'Source'].map((f) => (
          <button key={f} type="button" className="filter-chip" onClick={() => unavailable(`The ${f} filter`)}>
            {f} <CaretIcon />
          </button>
        ))}
      </div>
    )

    const empty = searching ? (
      <div className="empty-state" role="status">
        <div className="empty-art" aria-hidden="true">
          <SearchIcon size={40} />
        </div>
        <h2>No results for “{query.trim()}”</h2>
        <p>Try another name. Search only covers the simulated files in this prototype.</p>
        <button type="button" className="btn btn-tonal" onClick={() => setQuery('')}>
          Clear search
        </button>
      </div>
    ) : (
      <div className="empty-state">
        <div className="empty-art" aria-hidden="true">
          <FolderIcon size={40} />
        </div>
        <h2>This folder is empty</h2>
        <p>Nothing has been added to “{currentName}”.</p>
      </div>
    )

    const list =
      items.length === 0 ? (
        empty
      ) : view === 'list' ? (
        <table className="file-table">
          <thead>
            <tr>
              <th scope="col" aria-sort="ascending">
                <span className="th-sort">
                  Name <ArrowDownIcon size={16} />
                </span>
              </th>
              <th scope="col">Owner</th>
              <th scope="col">Date modified</th>
              <th scope="col">File size</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const ok = canOpen(scenario, item.id, viewer)
              const isSel = selected === item.id
              return (
                <tr
                  key={item.id}
                  className={isSel ? 'selected' : ''}
                  onClick={() => select(item)}
                  onDoubleClick={() => openItem(item)}
                >
                  <td>
                    <button
                      type="button"
                      className="name-cell"
                      aria-pressed={isSel}
                      aria-describedby="open-hint"
                      onClick={(e) => {
                        e.stopPropagation()
                        select(item)
                      }}
                      onKeyDown={rowKey(item)}
                    >
                      {itemIcon(item)}
                      <span className="name-text">
                        <span>{item.name}</span>
                        {searching && (
                          <span className="name-path">{displayPath(scenario, item.parentId!) || rootLabel}</span>
                        )}
                      </span>
                      {isLimited(item) && (
                        <span className="chip">
                          <LockIcon size={12} /> Limited access
                        </span>
                      )}
                      {!ok && (
                        <span className="chip chip-locked">
                          <LockIcon size={12} /> Access required
                        </span>
                      )}
                    </button>
                  </td>
                  <td>{ownerCell}</td>
                  <td>{MODIFIED}</td>
                  <td>{sizeOf(item)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <Menu
                      label={`More actions for ${item.name}`}
                      button={<DotsIcon />}
                      onOpen={() => addLog('action_selected', `open menu: ${item.name}`)}
                      items={rowMenu(item)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <ul className="grid" aria-label="Files and folders">
          {items.map((item) => {
            const isSel = selected === item.id
            return (
              <li
                key={item.id}
                className={`card ${item.kind === 'folder' ? 'card-folder' : ''} ${isSel ? 'selected' : ''}`}
                onDoubleClick={() => openItem(item)}
              >
                <div className="card-head">
                  <button
                    type="button"
                    className="name-cell"
                    aria-pressed={isSel}
                    aria-describedby="open-hint"
                    onClick={() => select(item)}
                    onKeyDown={rowKey(item)}
                  >
                    {itemIcon(item, 20)}
                    <span className="name-text">{item.name}</span>
                  </button>
                  <Menu label={`More actions for ${item.name}`} button={<DotsIcon />} items={rowMenu(item)} />
                </div>
                {item.kind === 'file' && (
                  <div className={`card-thumb ${item.id}`} aria-hidden="true">
                    <ImageIcon size={48} />
                  </div>
                )}
                {item.kind === 'file' && (
                  <div className="card-meta">
                    {ownerCell} You modified · {MODIFIED}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )

    content = (
      <>
        <div className="main-head">
          {heading}
          <div className="view-tools">
            <div className="segmented" role="group" aria-label="Layout">
              <button
                type="button"
                aria-pressed={view === 'list'}
                aria-label="List layout"
                onClick={() => setView('list')}
              >
                {view === 'list' && <CheckIcon size={16} />}
                <ListIcon />
              </button>
              <button
                type="button"
                aria-pressed={view === 'grid'}
                aria-label="Grid layout"
                onClick={() => setView('grid')}
              >
                {view === 'grid' && <CheckIcon size={16} />}
                <GridIcon />
              </button>
            </div>
            <button
              type="button"
              className={`icon-button ${details ? 'toggled' : ''}`}
              aria-label="View details"
              aria-pressed={details}
              onClick={() => {
                setDetails(!details)
                addLog('action_selected', `details pane ${details ? 'closed' : 'opened'}`)
              }}
            >
              <InfoIcon />
            </button>
          </div>
        </div>
        {toolbar}
        {!searching && !folderOk ? <NeedAccess name={currentName} viewer={viewer} /> : list}
        <p id="open-hint" className="visually-hidden">
          Press Enter or double-click to open.
        </p>
      </>
    )
  }

  return (
    <div className={`app ${rail ? '' : 'rail-hidden'}`}>
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <span>Drive</span>
        </div>
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            addLog('action_selected', `search: ${query.trim()}`)
          }}
        >
          <button type="submit" className="icon-button" aria-label="Search">
            <SearchIcon />
          </button>
          <input
            type="search"
            aria-label="Search in Drive"
            placeholder="Search in Drive"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
              if (e.target.value.trim()) setSection('drive')
            }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Search options"
            onClick={() => unavailable('Search options')}
          >
            <TuneIcon />
          </button>
        </form>
        <div className="top-actions">
          <span className="study-label" role="note">
            Independent study prototype — not affiliated with Google.
          </span>
          <button type="button" className="icon-button" aria-label="Support" onClick={() => unavailable('Support')}>
            <HelpIcon />
          </button>
          <button type="button" className="icon-button" aria-label="Settings" onClick={() => unavailable('Settings')}>
            <SettingsIcon />
          </button>
          <button type="button" className="icon-button" aria-label="Apps" onClick={() => unavailable('Apps')}>
            <AppsIcon />
          </button>
          <button
            type="button"
            className="account"
            aria-label={`Account: ${personName(viewer)} (simulated, not signed in)`}
            onClick={() => unavailable('The account menu')}
          >
            <span className={`avatar avatar-${viewer}`}>{viewer === 'you' ? 'Y' : personName(viewer)[0]}</span>
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Drive sections">
        <button type="button" className="new-button" onClick={() => unavailable('Creating new files')}>
          <PlusIcon /> New
        </button>
        <ul>
          {navItems.map((n) => (
            <li key={n.id} className={n.gap ? 'gap' : ''}>
              <button
                type="button"
                className={`nav-item ${navActive(n.id) ? 'active' : ''}`}
                aria-current={navActive(n.id) ? 'page' : undefined}
                onClick={() => (n.id === 'storage' ? unavailable('Storage management') : goSection(n.id))}
              >
                {n.icon}
                <span>{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="storage">
          <div className="storage-bar" role="img" aria-label="Simulated storage: 2.4 GB of 15 GB used">
            <span style={{ width: '16%' }} />
          </div>
          <span>2.4 GB of 15 GB used</span>
        </div>
      </nav>

      <main className={`main ${details && inDrive ? 'with-details' : ''}`}>
        <div className="main-scroll">
          {viewer !== 'you' && (
            <div className="preview-banner" role="status">
              Previewing as {personName(viewer)} — facilitator inspection tool, not a proposed Drive feature.
            </div>
          )}
          {content}
        </div>
        {details && inDrive && (
          <DetailsPane
            scenario={scenario}
            item={detailsItem}
            onClose={() => setDetails(false)}
            onManage={
              detailsItem && viewer === 'you' && detailsItem.kind === 'file' ? () => openShare(detailsItem) : undefined
            }
            onUnavailable={unavailable}
          />
        )}
      </main>

      {rail ? (
        <aside className="rail" aria-label="Side apps">
          {[
            { label: 'Calendar', icon: <CalendarIcon />, cls: 'r-cal' },
            { label: 'Notes', icon: <BulbIcon />, cls: 'r-notes' },
            { label: 'Tasks', icon: <TaskIcon />, cls: 'r-tasks' },
            { label: 'Contacts', icon: <ContactIcon />, cls: 'r-contacts' },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              className={`icon-button rail-app ${a.cls}`}
              aria-label={a.label}
              onClick={() => unavailable(a.label)}
            >
              {a.icon}
            </button>
          ))}
          <span className="rail-sep" />
          <button type="button" className="icon-button" aria-label="Get add-ons" onClick={() => unavailable('Add-ons')}>
            <PlusIcon size={20} />
          </button>
          <button
            type="button"
            className="icon-button rail-collapse"
            aria-label="Hide side panel"
            onClick={() => setRail(false)}
          >
            <ChevronRightIcon />
          </button>
        </aside>
      ) : (
        <button
          type="button"
          className="icon-button rail-expand"
          aria-label="Show side panel"
          onClick={() => setRail(true)}
        >
          <ChevronRightIcon />
        </button>
      )}

      {mode === 'facilitator' && (
        <>
          {/* Kept mounted (just hidden) so closing the drawer can return focus here. */}
          <button
            ref={launchRef}
            type="button"
            className="facilitator-launch"
            hidden={drawer}
            onClick={() => setDrawer(true)}
          >
            Facilitator tools
          </button>
          {drawer && (
            <Facilitator
              scenario={scenario}
              variant={variant}
              onVariant={switchVariant}
              viewer={viewer}
              onViewer={(v) => {
                setViewer(v)
                setSection('drive')
                setFolderId(PROJECT_ID)
                setSelected(null)
                setQuery('')
                addLog('facilitator', `preview access as ${personName(v)}`)
              }}
              failureMode={failureMode}
              onFailureMode={(m) => {
                setFailureMode(m)
                addLog('facilitator', `failure simulation → ${m}`)
              }}
              onOpen={(item) => openItem(item)}
              onReset={reset}
              onParticipant={() => switchMode('participant')}
              onClose={() => setDrawer(false)}
              log={log}
            />
          )}
        </>
      )}

      {flow && (
        <ShareFlow
          key={flow.key}
          scenario={scenario}
          fileId={flow.fileId}
          failureMode={failureMode}
          onFailureUsed={() => failureMode === 'next' && setFailureMode('off')}
          onCommit={(s) => setScenarios((prev) => ({ ...prev, [flow.variant]: s }))}
          variant={flow.variant}
          onUnavailable={unavailable}
          onClose={(to) => {
            setFlow(null)
            addLog('screen_opened', 'share flow closed')
            if (to) navigate(to)
          }}
          log={addLog}
        />
      )}

      {opened && (
        <OpenResult
          scenario={scenario}
          itemId={opened.itemId}
          ok={opened.ok}
          viewer={viewer}
          onClose={() => setOpened(null)}
        />
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.key}>
            <span>{toast.text}</span>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
              <CloseIcon size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailsPane({
  scenario,
  item,
  onClose,
  onManage,
  onUnavailable,
}: {
  scenario: Scenario
  item?: Item
  onClose: () => void
  onManage?: () => void
  onUnavailable: (what: string) => void
}) {
  return (
    <aside className="details" aria-labelledby="details-title">
      <div className="details-head">
        {item && itemIcon(item)}
        <h2 id="details-title">{item ? item.name : 'Details'}</h2>
        <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {!item ? (
        <p className="muted details-empty">Select a file or folder to see its details.</p>
      ) : (
        <div className="details-body">
          <div className={`details-preview ${item.kind === 'file' ? item.id : ''}`} aria-hidden="true">
            {itemIcon(item, 56)}
          </div>
          <h3>Who has access</h3>
          <div className="avatar-row">
            {peopleWithAccess(scenario, item.id).map((p) => (
              <span
                key={p}
                className={`avatar avatar-${p}`}
                title={`${personName(p)} · ${roleOf(scenario, item.id, p)}`}
              >
                {p === 'you' ? 'Y' : personName(p)[0]}
                <span className="visually-hidden">
                  {personName(p)}, {roleOf(scenario, item.id, p)}
                </span>
              </span>
            ))}
          </div>
          <p className="muted">
            {isLimited(item)
              ? 'Limited access. Only people added to this folder can open it.'
              : item.id === ROOT_ID
                ? 'Private to you.'
                : `Shared with ${peopleWithAccess(scenario, item.id).length - 1} people.`}
          </p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onManage ?? (() => onUnavailable('Managing folder access'))}
          >
            Manage access
          </button>
          <h3>{item.kind === 'folder' ? 'Folder' : 'File'} details</h3>
          <dl className="details-list">
            <dt>Type</dt>
            <dd>{item.kind === 'folder' ? 'Folder' : 'PNG image'}</dd>
            {item.kind === 'file' && (
              <>
                <dt>Size</dt>
                <dd>{sizeOf(item)}</dd>
              </>
            )}
            <dt>Location</dt>
            <dd>{item.parentId ? displayPath(scenario, item.parentId) || 'My Drive' : '—'}</dd>
            <dt>Owner</dt>
            <dd>me</dd>
            <dt>Modified</dt>
            <dd>{MODIFIED} by me</dd>
            <dt>Created</dt>
            <dd>Oct 20, 2026</dd>
          </dl>
          <p className="muted small">Details are sample data for this study.</p>
        </div>
      )}
    </aside>
  )
}

function NeedAccess({ name, viewer }: { name: string; viewer: PersonId }) {
  return (
    <div className="empty-state">
      <div className="empty-art" aria-hidden="true">
        <LockIcon size={40} />
      </div>
      <h2>You need access</h2>
      <p>
        {personName(viewer)} doesn’t have access to “{name}”.
      </p>
    </div>
  )
}

function OpenResult({
  scenario,
  itemId,
  ok,
  viewer,
  onClose,
}: {
  scenario: Scenario
  itemId: string
  ok: boolean
  viewer: PersonId
  onClose: () => void
}) {
  const item = getItem(scenario, itemId)
  const role = roleOf(scenario, itemId, viewer)
  return (
    <Modal labelledBy="open-title" onEscape={onClose} size={ok ? 'lg' : 'sm'}>
      <div className="dialog-header">
        <h2 id="open-title" tabIndex={-1}>
          {ok ? item.name : 'You need access'}
        </h2>
      </div>
      <div className="dialog-body">
        {ok ? (
          <>
            <div className={`image-preview ${item.id}`} role="img" aria-label={`Sample preview of ${item.name}`}>
              <span>{item.name}</span>
            </div>
            <p className="muted">
              Opened as {personName(viewer)} · {role}
            </p>
          </>
        ) : (
          <div className="need-access compact">
            <LockIcon size={32} />
            <p>
              {personName(viewer)} doesn’t have access to “{item.name}”.
            </p>
          </div>
        )}
      </div>
      <div className="dialog-footer">
        <span />
        <button type="button" className="btn btn-filled" data-autofocus onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
