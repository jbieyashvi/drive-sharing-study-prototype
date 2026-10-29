import { describe, expect, it } from 'vitest'
import {
  PEOPLE,
  PRIVATE_ID,
  PROJECT_ID,
  access,
  applyRemoveFromFolder,
  applyShareFile,
  applyRestrict,
  canOpen,
  getItem,
  initialScenario,
  lostAccess,
  restoreScenario,
  roleOf,
  type Scenario,
  validateFolderName,
} from './model'

describe('initial scenario', () => {
  it('files inherit from Client Project', () => {
    const s = initialScenario()
    expect(roleOf(s, 'file-a', 'you')).toBe('Owner')
    expect(roleOf(s, 'file-a', 'maya')).toBe('Editor')
    expect(roleOf(s, 'file-a', 'ravi')).toBe('Viewer')
    expect(roleOf(s, 'file-a', 'alex')).toBe('Editor')
  })
})

describe('restrict branch', () => {
  const s = initialScenario()
  const { scenario: after, operations } = applyRestrict(s, { fileId: 'file-a', folderName: 'Private files', keep: ['maya', 'ravi'] })
  const folderId = getItem(after, 'file-a').parentId!

  it('moves File A into a new limited folder in the project', () => {
    expect(getItem(after, folderId).name).toBe('Private files')
    expect(getItem(after, folderId).parentId).toBe(PROJECT_ID)
    expect(getItem(after, 'file-b').parentId).toBe(PROJECT_ID)
    expect(operations).toHaveLength(3)
    expect(operations.join(' ')).not.toMatch(/grant|ACL/i)
  })

  it('removes Alex from File A only, preserving roles', () => {
    expect(canOpen(after, 'file-a', 'alex')).toBe(false)
    expect(canOpen(after, folderId, 'alex')).toBe(false)
    expect(roleOf(after, 'file-b', 'alex')).toBe('Editor')
    expect(roleOf(after, PROJECT_ID, 'alex')).toBe('Editor')
    expect(roleOf(after, 'file-a', 'maya')).toBe('Editor')
    expect(roleOf(after, 'file-a', 'ravi')).toBe('Viewer')
    expect(roleOf(after, 'file-a', 'you')).toBe('Owner')
  })

  it('does not mutate the input scenario', () => {
    expect(getItem(s, 'file-a').parentId).toBe(PROJECT_ID)
    expect(s.items).toHaveLength(4)
  })

  it('keeps Alex when reselected', () => {
    const r = applyRestrict(s, { fileId: 'file-a', folderName: 'Private files', keep: ['maya', 'ravi', 'alex'] })
    expect(roleOf(r.scenario, 'file-a', 'alex')).toBe('Editor')
  })

  it('removes contradicting direct file grants', () => {
    const withGrant = structuredClone(s)
    getItem(withGrant, 'file-a').grants.alex = 'Viewer'
    const r = applyRestrict(withGrant, { fileId: 'file-a', folderName: 'Private files', keep: ['maya', 'ravi'] })
    expect(canOpen(r.scenario, 'file-a', 'alex')).toBe(false)
    expect(r.operations).toHaveLength(4)
  })

  it('rejects colliding names', () => {
    expect(validateFolderName(after, PROJECT_ID, ' private FILES ')).toMatch(/already exists/)
    expect(validateFolderName(after, PROJECT_ID, '   ')).toBe('Enter a folder name.')
    expect(() => applyRestrict(after, { fileId: 'file-b', folderName: 'Private files', keep: [] })).toThrow()
  })
})

describe('project removal branch', () => {
  it('removes Alex from the project and both files', () => {
    const s = initialScenario()
    const { scenario: after } = applyRemoveFromFolder(s, PROJECT_ID, 'alex')
    expect(lostAccess(s, after, PROJECT_ID, 'alex').map((i) => i.id)).toEqual([PROJECT_ID, 'file-a', 'file-b'])
    expect(roleOf(after, 'file-a', 'maya')).toBe('Editor')
  })
})

describe('restoration scenario: direct file access with a blocked parent', () => {
  const s = restoreScenario()
  // Every (item, person) role, to prove nothing but the target cell changes.
  const snapshot = (sc: Scenario) =>
    Object.fromEntries(sc.items.flatMap((i) => PEOPLE.map((p) => [`${i.id}/${p.id}`, roleOf(sc, i.id, p.id)])))

  it('starts with Alex shut out of Private files and both files in it', () => {
    for (const id of [PRIVATE_ID, 'file-a', 'file-c']) expect(canOpen(s, id, 'alex')).toBe(false)
    expect(roleOf(s, PROJECT_ID, 'alex')).toBe('Editor')
    expect(roleOf(s, 'file-b', 'alex')).toBe('Editor')
    expect(roleOf(s, 'file-c', 'maya')).toBe('Editor')
    expect(roleOf(s, 'file-c', 'ravi')).toBe('Viewer')
    expect(roleOf(s, 'file-c', 'you')).toBe('Owner')
  })

  it('a direct grant on File C opens it without opening the folder or File A', () => {
    const { scenario: after } = applyShareFile(s, 'file-c', 'alex', 'Viewer')
    expect(access(after, 'file-c', 'alex')).toEqual({ role: 'Viewer', sourceId: 'file-c' })
    expect(canOpen(after, PRIVATE_ID, 'alex')).toBe(false)
    expect(canOpen(after, 'file-a', 'alex')).toBe(false)
    expect(roleOf(after, PROJECT_ID, 'alex')).toBe('Editor')
    expect(roleOf(after, 'file-b', 'alex')).toBe('Editor')
    // File C stays where it was, and the folder still doesn't inherit.
    expect(getItem(after, 'file-c').parentId).toBe(PRIVATE_ID)
    expect(getItem(after, PRIVATE_ID).inherits).toBe(false)
    expect(getItem(after, PRIVATE_ID).grants.alex).toBeUndefined()
    expect(after.items).toHaveLength(s.items.length)
  })

  it('changes only the Alex / File C cell', () => {
    const before = snapshot(s)
    const after = snapshot(applyShareFile(s, 'file-c', 'alex', 'Viewer').scenario)
    const changed = Object.keys(before).filter((k) => before[k] !== after[k])
    expect(changed).toEqual(['file-c/alex'])
  })

  it.each(['Viewer', 'Commenter', 'Editor'] as const)('grants the chosen role (%s), not the project role', (role) => {
    const { scenario: after } = applyShareFile(s, 'file-c', 'alex', role)
    expect(roleOf(after, 'file-c', 'alex')).toBe(role)
    expect(canOpen(after, 'file-a', 'alex')).toBe(false)
  })

  it('is idempotent: re-applying adds no duplicate grant', () => {
    const once = applyShareFile(s, 'file-c', 'alex', 'Viewer').scenario
    const twice = applyShareFile(once, 'file-c', 'alex', 'Viewer')
    expect(twice.scenario).toEqual(once)
    expect(Object.keys(getItem(twice.scenario, 'file-c').grants)).toEqual(['alex'])
    expect(twice.operations[0]).toMatch(/already had/)
  })

  it('does not mutate the input and refuses folders', () => {
    applyShareFile(s, 'file-c', 'alex', 'Editor')
    expect(getItem(s, 'file-c').grants).toEqual({})
    expect(() => applyShareFile(s, PRIVATE_ID, 'alex', 'Viewer')).toThrow()
  })

  it('ranks Commenter between Viewer and Editor', () => {
    const sc = structuredClone(s)
    getItem(sc, 'file-c').grants.ravi = 'Commenter'
    expect(access(sc, 'file-c', 'ravi')).toEqual({ role: 'Commenter', sourceId: 'file-c' })
    getItem(sc, 'file-c').grants.maya = 'Commenter'
    expect(roleOf(sc, 'file-c', 'maya')).toBe('Editor')
  })
})

describe('regression: restrict a file, then restore direct access to the same file', () => {
  const snapshot = (s: Scenario) =>
    Object.fromEntries(s.items.flatMap((i) => PEOPLE.map((p) => [`${i.id}/${p.id}`, roleOf(s, i.id, p.id)])))

  it('grants File A only; the new limited-access folder stays blocked and nothing else changes', () => {
    const restricted = applyRestrict(initialScenario(), { fileId: 'file-a', folderName: 'Private files', keep: ['maya', 'ravi'] }).scenario
    const folderId = getItem(restricted, 'file-a').parentId!
    expect(canOpen(restricted, 'file-a', 'alex')).toBe(false)

    const { scenario: restored } = applyShareFile(restricted, 'file-a', 'alex', 'Viewer')
    expect(access(restored, 'file-a', 'alex')).toEqual({ role: 'Viewer', sourceId: 'file-a' })
    expect(canOpen(restored, folderId, 'alex')).toBe(false)
    expect(getItem(restored, folderId).inherits).toBe(false)
    expect(getItem(restored, folderId).grants.alex).toBeUndefined()
    expect(getItem(restored, 'file-a').parentId).toBe(folderId)
    expect(roleOf(restored, PROJECT_ID, 'alex')).toBe('Editor')
    expect(roleOf(restored, 'file-b', 'alex')).toBe('Editor')

    const before = snapshot(restricted)
    const after = snapshot(restored)
    const changed = Object.keys(after).filter((k) => after[k] !== before[k])
    expect(changed).toEqual(['file-a/alex'])
  })

  it('sharing again with the same role adds no duplicate grant', () => {
    const restricted = applyRestrict(initialScenario(), { fileId: 'file-a', folderName: 'Private files', keep: ['maya', 'ravi'] }).scenario
    const once = applyShareFile(restricted, 'file-a', 'alex', 'Viewer').scenario
    const twice = applyShareFile(once, 'file-a', 'alex', 'Viewer')
    expect(twice.scenario).toEqual(once)
    expect(twice.operations[0]).toMatch(/already had Viewer/)
  })
})
