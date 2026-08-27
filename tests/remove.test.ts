import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InstallService, type SnapshotCatalog } from '../src/storage/install-service.ts'
import { RemovalService } from '../src/storage/removal-service.ts'
import type { SkillSnapshot } from '../src/storage/snapshot.ts'

const temporaryRoots: string[] = []
const snapshot: SkillSnapshot = {
  hash: 'a'.repeat(64),
  files: [{
    path: 'SKILL.md',
    contents: '---\nname: safe-skill\ndescription: A safe skill\n---\n\nOriginal\n',
  }],
}
const catalog: SnapshotCatalog = {
  async download() {
    return snapshot
  },
}

async function setup(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-skill-remove-'))
  temporaryRoots.push(parent)
  const skillsRoot = join(parent, 'skills')
  const installer = new InstallService({ skillsRoot, catalog })
  const prepared = await installer.prepare('owner/repo/safe-skill', new AbortController().signal)
  await installer.confirm({ operationId: prepared.operationId, overwrite: false })
  return skillsRoot
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('RemovalService', () => {
  it('removes a Managed Skill and its ownership record after confirmation', async () => {
    const skillsRoot = await setup()
    const service = new RemovalService({ skillsRoot })
    const prepared = await service.prepare('safe-skill')

    expect(existsSync(join(skillsRoot, 'safe-skill'))).toBe(true)
    await service.confirm(prepared.operationId)

    expect(existsSync(join(skillsRoot, 'safe-skill'))).toBe(false)
    const manifest = await readFile(
      join(skillsRoot, '.dsh-skill-manager', 'manifest.json'),
      'utf8',
    )
    expect(manifest).not.toContain('safe-skill')
  })

  it('reports local modifications in the confirmation data', async () => {
    const skillsRoot = await setup()
    await writeFile(
      join(skillsRoot, 'safe-skill', 'SKILL.md'),
      '---\nname: safe-skill\ndescription: Local\n---\n\nModified\n',
    )
    const prepared = await new RemovalService({ skillsRoot }).prepare('safe-skill')

    expect(prepared.state).toBe('locally-modified')
  })

  it('rejects removal of a skill the plugin does not manage', async () => {
    const skillsRoot = await setup()
    await expect(new RemovalService({ skillsRoot }).prepare('user-skill'))
      .rejects.toMatchObject({ code: 'not-managed' })
  })

  it('rejects a stale confirmation after local state changes', async () => {
    const skillsRoot = await setup()
    const service = new RemovalService({ skillsRoot })
    const prepared = await service.prepare('safe-skill')
    await writeFile(
      join(skillsRoot, 'safe-skill', 'SKILL.md'),
      '---\nname: safe-skill\ndescription: Changed\n---\n\nChanged\n',
    )

    await expect(service.confirm(prepared.operationId))
      .rejects.toMatchObject({ code: 'state-changed' })
    expect(existsSync(join(skillsRoot, 'safe-skill'))).toBe(true)
  })

  it('restores the skill when manifest commit fails', async () => {
    const skillsRoot = await setup()
    const service = new RemovalService({
      skillsRoot,
      async writeManifest() {
        throw new Error('disk failure')
      },
    })
    const prepared = await service.prepare('safe-skill')

    await expect(service.confirm(prepared.operationId))
      .rejects.toMatchObject({ code: 'remove-failed' })
    expect(await readFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'utf8'))
      .toContain('Original')
  })

  it('counts queued removals against the pending operation limit', async () => {
    const skillsRoot = await setup()
    const service = new RemovalService({
      skillsRoot,
      maxPendingOperations: 1,
    })
    const prepared = await service.prepare('safe-skill')
    const confirmation = service.confirm(prepared.operationId)

    await expect(service.prepare('safe-skill'))
      .rejects.toMatchObject({ code: 'remove-failed' })
    await confirmation
  })
})
