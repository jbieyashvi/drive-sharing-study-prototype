import { describe, expect, it } from 'vitest'
import {
  PROJECT_ID,
  applyRemoveFromFolder,
  applyRestrict,
  canOpen,
  getItem,
  initialScenario,
  lostAccess,
  roleOf,
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
