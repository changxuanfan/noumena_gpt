import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InstallService, type SnapshotCatalog } from '../src/storage/install-service.ts'
import { InventoryService } from '../src/storage/inventory-service.ts'
import type { SkillSnapshot } from '../src/storage/snapshot.ts'

const temporaryRoots: string[] = []

async function skillsRoot(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-skill-inventory-'))
  temporaryRoots.push(parent)
  return join(parent, 'skills')
}

const snapshot: SkillSnapshot = {
  hash: 'a'.repeat(64),
  files: [{
    path: 'SKILL.md',
    contents: '---\nname: safe-skill\ndescription: A safe skill\n---\n\n# Safe\n',
  }, {
    path: 'references/bom.txt',
    contents: '\uFEFFBOM-preserving content\n',
  }],
}

const catalog: SnapshotCatalog = {
  async download() {
    return snapshot
  },
}

async function install(root: string): Promise<void> {
  const service = new InstallService({ skillsRoot: root, catalog })
  const prepared = await service.prepare('owner/repo/safe-skill', new AbortController().signal)
  await service.confirm({ operationId: prepared.operationId, overwrite: false })
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('InventoryService', () => {
  it('lists a verified Managed Skill as current', async () => {
    const root = await skillsRoot()
    await install(root)

    await expect(new InventoryService(root).list()).resolves.toEqual([
      expect.objectContaining({
        name: 'safe-skill',
        source: 'owner/repo',
        state: 'current',
      }),
    ])
  })

  it('detects local modifications', async () => {
    const root = await skillsRoot()
    await install(root)
    await writeFile(join(root, 'safe-skill', 'SKILL.md'),
      '---\nname: safe-skill\ndescription: Changed\n---\n\nChanged\n')

    await expect(new InventoryService(root).list()).resolves.toEqual([
      expect.objectContaining({ name: 'safe-skill', state: 'locally-modified' }),
    ])
  })

  it('distinguishes missing and invalid Managed Skills', async () => {
    const root = await skillsRoot()
    await install(root)
    await unlink(join(root, 'safe-skill', 'SKILL.md'))
    expect((await new InventoryService(root).list())[0]?.state).toBe('invalid')

    await rm(join(root, 'safe-skill'), { recursive: true })
    expect((await new InventoryService(root).list())[0]?.state).toBe('missing')
  })

  it('does not claim user-owned skills', async () => {
    const root = await skillsRoot()
    await mkdir(join(root, 'user-skill'), { recursive: true })
    await writeFile(join(root, 'user-skill', 'SKILL.md'),
      '---\nname: user-skill\ndescription: User owned\n---\n')

    await expect(new InventoryService(root).list()).resolves.toEqual([])
  })

  it('surfaces a malformed manifest instead of returning a false empty list', async () => {
    const root = await skillsRoot()
    const manager = join(root, '.dsh-skill-manager')
    await mkdir(manager, { recursive: true })
    await writeFile(join(manager, 'manifest.json'), '{ invalid')

    await expect(new InventoryService(root).list())
      .rejects.toMatchObject({ code: 'manifest-invalid' })
  })
})
