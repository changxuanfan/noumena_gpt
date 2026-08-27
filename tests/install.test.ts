import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InstallService, type SnapshotCatalog } from '../src/storage/install-service.ts'
import type { SkillSnapshot } from '../src/storage/snapshot.ts'

const temporaryRoots: string[] = []

async function temporarySkillsRoot(): Promise<{ parent: string; skillsRoot: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-skill-manager-'))
  temporaryRoots.push(parent)
  return { parent, skillsRoot: join(parent, 'skills') }
}

function snapshot(body = '# Safe'): SkillSnapshot {
  return {
    hash: 'remote-hash',
    files: [
      {
        path: 'SKILL.md',
        contents: `---\nname: safe-skill\ndescription: A safe test skill\n---\n\n${body}\n`,
      },
      { path: 'references/guide.md', contents: '# Guide\n' },
    ],
  }
}

function catalog(value: SkillSnapshot = snapshot()): SnapshotCatalog {
  return {
    async download() {
      return value
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('InstallService', () => {
  it('does not write before confirmation and installs a discoverable bundle after confirmation', async () => {
    const { skillsRoot } = await temporarySkillsRoot()
    const service = new InstallService({ skillsRoot, catalog: catalog() })

    const prepared = await service.prepare(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )
    expect(existsSync(skillsRoot)).toBe(false)

    const installed = await service.confirm({
      operationId: prepared.operationId,
      overwrite: false,
    })

    expect(installed.name).toBe('safe-skill')
    expect(await readFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'utf8'))
      .toContain('name: safe-skill')
    const manifest = JSON.parse(
      await readFile(join(skillsRoot, '.dsh-skill-manager', 'manifest.json'), 'utf8'),
    ) as { skills: Record<string, unknown> }
    expect(manifest.skills['safe-skill']).toBeTruthy()
  })

  it('rejects a traversal snapshot without writing outside the Skills Root', async () => {
    const { parent, skillsRoot } = await temporarySkillsRoot()
    const unsafe = snapshot()
    unsafe.files.push({ path: '../outside.txt', contents: 'unsafe' })
    const service = new InstallService({ skillsRoot, catalog: catalog(unsafe) })

    await expect(service.prepare(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'unsafe-path' })
    expect(existsSync(join(parent, 'outside.txt'))).toBe(false)
    expect(existsSync(skillsRoot)).toBe(false)
  })

  it('never overwrites an unmanaged directory', async () => {
    const { skillsRoot } = await temporarySkillsRoot()
    await mkdir(join(skillsRoot, 'safe-skill'), { recursive: true })
    await writeFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'user-owned')
    const service = new InstallService({ skillsRoot, catalog: catalog() })

    await expect(service.prepare(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'unmanaged-collision' })
    expect(await readFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'utf8'))
      .toBe('user-owned')
  })

  it('does not treat inherited object keys as managed ownership', async () => {
    const { skillsRoot } = await temporarySkillsRoot()
    await mkdir(join(skillsRoot, 'constructor'), { recursive: true })
    await writeFile(join(skillsRoot, 'constructor', 'SKILL.md'), 'user-owned')
    const constructorSnapshot: SkillSnapshot = {
      hash: 'remote-hash',
      files: [{
        path: 'SKILL.md',
        contents: '---\nname: constructor\ndescription: Constructor skill\n---\n',
      }],
    }
    const service = new InstallService({
      skillsRoot,
      catalog: catalog(constructorSnapshot),
    })

    await expect(service.prepare(
      'owner/repo/constructor',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'unmanaged-collision' })
    expect(await readFile(join(skillsRoot, 'constructor', 'SKILL.md'), 'utf8'))
      .toBe('user-owned')
  })

  it('requires overwrite confirmation for a duplicate Managed Skill', async () => {
    const { skillsRoot } = await temporarySkillsRoot()
    const service = new InstallService({ skillsRoot, catalog: catalog() })
    const first = await service.prepare('owner/repo/safe-skill', new AbortController().signal)
    await service.confirm({ operationId: first.operationId, overwrite: false })

    const duplicate = await service.prepare(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )
    expect(duplicate.collision).toBe('managed')
    await expect(service.confirm({
      operationId: duplicate.operationId,
      overwrite: false,
    })).rejects.toMatchObject({ code: 'overwrite-required' })
  })

  it('rejects a manager directory symlink that escapes the Skills Root', async () => {
    const { parent, skillsRoot } = await temporarySkillsRoot()
    const outside = join(parent, 'outside-manager')
    await mkdir(skillsRoot, { recursive: true })
    await mkdir(outside)
    await symlink(outside, join(skillsRoot, '.dsh-skill-manager'))
    const service = new InstallService({ skillsRoot, catalog: catalog() })

    await expect(service.prepare(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'unsafe-root' })
    expect(existsSync(join(outside, 'manifest.json'))).toBe(false)
  })

  it('rejects a staging directory symlink that escapes the Skills Root', async () => {
    const { parent, skillsRoot } = await temporarySkillsRoot()
    const manager = join(skillsRoot, '.dsh-skill-manager')
    const outside = join(parent, 'outside-staging')
    await mkdir(manager, { recursive: true })
    await mkdir(outside)
    await symlink(outside, join(manager, 'staging'))
    const service = new InstallService({ skillsRoot, catalog: catalog() })
    const prepared = await service.prepare('owner/repo/safe-skill', new AbortController().signal)

    await expect(service.confirm({
      operationId: prepared.operationId,
      overwrite: false,
    })).rejects.toMatchObject({ code: 'unsafe-root' })
    expect(existsSync(join(outside, 'SKILL.md'))).toBe(false)
  })

  it('expires prepared snapshots instead of retaining them indefinitely', async () => {
    const { skillsRoot } = await temporarySkillsRoot()
    let now = new Date('2026-08-27T11:00:00.000Z')
    const service = new InstallService({
      skillsRoot,
      catalog: catalog(),
      now: () => now,
      operationTtlMs: 1_000,
    })
    const prepared = await service.prepare('owner/repo/safe-skill', new AbortController().signal)
    now = new Date('2026-08-27T11:00:02.000Z')

    await expect(service.confirm({
      operationId: prepared.operationId,
      overwrite: false,
    })).rejects.toMatchObject({ code: 'operation-expired' })
  })

  it('counts queued commits against the prepared snapshot limit', async () => {
    const { skillsRoot } = await temporarySkillsRoot()
    const service = new InstallService({
      skillsRoot,
      catalog: catalog(),
      maxPendingOperations: 1,
    })
    const prepared = await service.prepare('owner/repo/safe-skill', new AbortController().signal)
    const confirmation = service.confirm({
      operationId: prepared.operationId,
      overwrite: false,
    })

    await expect(service.prepare(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'install-failed' })
    await confirmation
  })
})
