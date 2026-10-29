// Simulated permission model. Everything here is pure: functions take a
// Scenario and return a new one, so review screens can preview the exact
// result that confirmation will commit.

export type PersonId = 'you' | 'maya' | 'ravi' | 'alex'
export type Role = 'Owner' | 'Editor' | 'Viewer'

export interface Person {
  id: PersonId
  name: string
  email: string
}

export const PEOPLE: Person[] = [
  { id: 'you', name: 'You', email: 'you@example.com' },
  { id: 'maya', name: 'Maya', email: 'maya@example.com' },
  { id: 'ravi', name: 'Ravi', email: 'ravi@example.com' },
  { id: 'alex', name: 'Alex', email: 'alex@example.com' },
]

export const personName = (id: PersonId) => PEOPLE.find((p) => p.id === id)!.name

export interface Item {
  id: string
  name: string
  kind: 'folder' | 'file'
  parentId: string | null
  /** false = limited access: grants from the parent do not flow down. */
  inherits: boolean
  grants: Partial<Record<PersonId, Role>>
}

export interface Scenario {
  items: Item[]
  nextId: number
}

export const ROOT_ID = 'my-drive'
export const PROJECT_ID = 'client-project'

export function initialScenario(): Scenario {
  return {
    nextId: 1,
    items: [
      { id: ROOT_ID, name: 'My Drive', kind: 'folder', parentId: null, inherits: false, grants: { you: 'Owner' } },
      {
        id: PROJECT_ID,
        name: 'Client Project',
        kind: 'folder',
        parentId: ROOT_ID,
        inherits: true,
        grants: { maya: 'Editor', ravi: 'Viewer', alex: 'Editor' },
      },
      { id: 'file-a', name: 'File A.png', kind: 'file', parentId: PROJECT_ID, inherits: true, grants: {} },
      { id: 'file-b', name: 'File B.png', kind: 'file', parentId: PROJECT_ID, inherits: true, grants: {} },
    ],
  }
}

const RANK: Record<Role, number> = { Owner: 3, Editor: 2, Viewer: 1 }

export function getItem(s: Scenario, id: string): Item {
  const item = s.items.find((i) => i.id === id)
  if (!item) throw new Error(`Unknown item ${id}`)
  return item
}

export function findItem(s: Scenario, id: string): Item | undefined {
  return s.items.find((i) => i.id === id)
}

export interface Access {
  role: Role
  /** Item the winning grant is attached to. */
  sourceId: string
}

/** Most permissive grant on the item or any ancestor it inherits from. */
export function access(s: Scenario, itemId: string, person: PersonId): Access | null {
  let best: Access | null = null
  let cur: Item | undefined = getItem(s, itemId)
  while (cur) {
    const role = cur.grants[person]
    if (role && (!best || RANK[role] > RANK[best.role])) best = { role, sourceId: cur.id }
    if (!cur.inherits || !cur.parentId) break
    cur = findItem(s, cur.parentId)
  }
  return best
}

export const roleOf = (s: Scenario, itemId: string, person: PersonId) => access(s, itemId, person)?.role ?? null

/** The single rule used by both summaries and simulated file opening. */
export const canOpen = (s: Scenario, itemId: string, person: PersonId) => roleOf(s, itemId, person) !== null

export function children(s: Scenario, folderId: string): Item[] {
  return s.items
    .filter((i) => i.parentId === folderId)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1))
}

export function descendants(s: Scenario, folderId: string): Item[] {
  return children(s, folderId).flatMap((c) => [c, ...(c.kind === 'folder' ? descendants(s, c.id) : [])])
}

export function path(s: Scenario, itemId: string): Item[] {
  const out: Item[] = []
  let cur: Item | undefined = getItem(s, itemId)
  while (cur) {
    out.unshift(cur)
    cur = cur.parentId ? findItem(s, cur.parentId) : undefined
  }
  return out
}

/** Path without "My Drive", e.g. "Client Project / Private files". */
export function displayPath(s: Scenario, itemId: string): string {
  return path(s, itemId)
    .filter((i) => i.id !== ROOT_ID)
    .map((i) => i.name)
    .join(' / ')
}

export const isLimited = (item: Item) => item.kind === 'folder' && !item.inherits && item.parentId !== null

/** People with any access to the item, owner first. */
export function peopleWithAccess(s: Scenario, itemId: string): PersonId[] {
  return PEOPLE.map((p) => p.id).filter((id) => canOpen(s, itemId, id))
}

const clone = (s: Scenario): Scenario => structuredClone(s)

// ---------------------------------------------------------------------------
// Branch B: keep project access, restrict this file

export function validateFolderName(s: Scenario, parentId: string, name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a folder name.'
  const clash = children(s, parentId).find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())
  if (clash) {
    const parent = getItem(s, parentId).name
    return clash.kind === 'folder'
      ? `A folder named “${clash.name}” already exists in ${parent}. Enter a different name. This creates a new folder; it won't add files to the existing one.`
      : `An item named “${clash.name}” already exists in ${parent}. Enter a different name.`
  }
  return null
}

export interface RestrictPlan {
  fileId: string
  folderName: string
  /** Collaborators (not the owner) who keep access. */
  keep: PersonId[]
}

export interface ApplyResult {
  scenario: Scenario
  operations: string[]
}

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

export function applyRestrict(s: Scenario, plan: RestrictPlan): ApplyResult {
  const next = clone(s)
  const file = getItem(next, plan.fileId)
  const parentId = file.parentId!
  const parentName = getItem(next, parentId).name
  const folderName = plan.folderName.trim()
  const nameError = validateFolderName(next, parentId, folderName)
  if (nameError) throw new Error(nameError)

  const before = Object.fromEntries(PEOPLE.map((p) => [p.id, roleOf(s, plan.fileId, p.id)])) as Record<PersonId, Role | null>
  const owners = PEOPLE.filter((p) => before[p.id] === 'Owner').map((p) => p.id)
  const kept = plan.keep.filter((p) => before[p] && before[p] !== 'Owner')
  const operations: string[] = []

  const folder: Item = {
    id: `folder-${next.nextId++}`,
    name: folderName,
    kind: 'folder',
    parentId,
    inherits: false,
    grants: Object.fromEntries(owners.map((o) => [o, 'Owner'])),
  }
  next.items.push(folder)
  operations.push(`Created the folder “${folderName}” inside ${parentName}. Sharing on ${parentName} doesn't reach it.`)

  for (const p of kept) folder.grants[p] = before[p]!
  operations.push(
    kept.length
      ? `Shared “${folderName}” with ${joinNames(kept.map((p) => `${personName(p)} (${before[p]})`))}, the same roles they had before.`
      : `Didn't share “${folderName}” with anyone else. Only you can open it.`,
  )

  file.parentId = folder.id
  operations.push(`Moved ${file.name} into “${folderName}”.`)

  // Direct grants on the file itself would survive the move and contradict the review.
  const contradicting = (Object.keys(file.grants) as PersonId[]).filter(
    (p) => file.grants[p] !== 'Owner' && !kept.includes(p),
  )
  for (const p of contradicting) delete file.grants[p]
  if (contradicting.length)
    operations.push(`Removed ${joinNames(contradicting.map(personName))}'s separate sharing on ${file.name}.`)

  return { scenario: next, operations }
}

// ---------------------------------------------------------------------------
// Branch A: remove access to the project

export function applyRemoveFromFolder(s: Scenario, folderId: string, person: PersonId): ApplyResult {
  const next = clone(s)
  const folder = getItem(next, folderId)
  const role = folder.grants[person]
  delete folder.grants[person]
  return {
    scenario: next,
    operations: [`Removed ${personName(person)}'s ${role ? `${role} ` : ''}access to ${folder.name}.`],
  }
}

/** Items (folder + inherited content) the person can open before but not after. */
export function lostAccess(before: Scenario, after: Scenario, folderId: string, person: PersonId): Item[] {
  return [getItem(before, folderId), ...descendants(before, folderId)].filter(
    (i) => canOpen(before, i.id, person) && !canOpen(after, i.id, person),
  )
}
