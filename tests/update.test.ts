import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillsShError } from '../src/skills-sh/client.ts'
import {
  InstallService,
  type SnapshotCatalog,
} from '../src/storage/install-service.ts'
import type { SkillSnapshot } from '../src/storage/snapshot.ts'

const temporaryRoots: string[] = []

function version(hashCharacter: string, body: string): SkillSnapshot {
  return {
    hash: hashCharacter.repeat(64),
    files: [{
      path: 'SKILL.md',
      contents: `---\nname: safe-skill\ndescription: A safe skill\n---\n\n${body}\n`,
    }],
  }
}

async function setup(): Promise<{
  skillsRoot: string
  original: SkillSnapshot
}> {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-skill-update-'))
  temporaryRoots.push(parent)
  const skillsRoot = join(parent, 'skills')
  const original = version('a', 'Original')
  const catalog: SnapshotCatalog = { async download() { return original } }
  const installer = new InstallService({ skillsRoot, catalog })
  const prepared = await installer.prepare('owner/repo/safe-skill', new AbortController().signal)
  await installer.confirm({ operationId: prepared.operationId, overwrite: false })
  return { skillsRoot, original }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Managed Skill updates', () => {
  it('reports a current skill without preparing a mutation', async () => {
    const { skillsRoot, original } = await setup()
    const service = new InstallService({
      skillsRoot,
      catalog: { async download() { return original } },
    })

    await expect(service.checkUpdate(
      'safe-skill',
      new AbortController().signal,
    )).resolves.toEqual({
      name: 'safe-skill',
      status: 'current',
      updateAvailable: false,
    })
  })

  it('prepares and applies an available update', async () => {
    const { skillsRoot } = await setup()
    const updated = version('b', 'Updated')
    const service = new InstallService({
      skillsRoot,
      catalog: { async download() { return updated } },
    })

    const check = await service.checkUpdate('safe-skill', new AbortController().signal)
    expect(check).toMatchObject({
      name: 'safe-skill',
      status: 'available',
      updateAvailable: true,
      operationId: expect.any(String),
    })
    await service.confirm({ operationId: check.operationId!, overwrite: true })

    expect(await readFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'utf8'))
      .toContain('Updated')
    const manifest = await readFile(
      join(skillsRoot, '.dsh-skill-manager', 'manifest.json'),
      'utf8',
    )
    expect(manifest).toContain(`\"remoteHash\": \"${'b'.repeat(64)}\"`)
  })

  it('warns when an update would overwrite local modifications', async () => {
    const { skillsRoot } = await setup()
    await writeFile(
      join(skillsRoot, 'safe-skill', 'SKILL.md'),
      '---\nname: safe-skill\ndescription: Local change\n---\n\nLocal\n',
    )
    const service = new InstallService({
      skillsRoot,
      catalog: { async download() { return version('b', 'Updated') } },
    })

    await expect(service.checkUpdate(
      'safe-skill',
      new AbortController().signal,
    )).resolves.toMatchObject({
      status: 'locally-modified',
      updateAvailable: true,
      operationId: expect.any(String),
    })
  })

  it('distinguishes an unavailable source from a retryable network error', async () => {
    const { skillsRoot } = await setup()
    const unavailable = new InstallService({
      skillsRoot,
      catalog: {
        async download() {
          throw new SkillsShError('upstream', 'missing', 404)
        },
      },
    })
    await expect(unavailable.checkUpdate(
      'safe-skill',
      new AbortController().signal,
    )).resolves.toEqual({
      name: 'safe-skill',
      status: 'source-unavailable',
      updateAvailable: false,
    })

    const offline = new InstallService({
      skillsRoot,
      catalog: {
        async download() {
          throw new SkillsShError('network', 'offline')
        },
      },
    })
    await expect(offline.checkUpdate(
      'safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'network' })
  })

  it('restores the original skill when manifest commit fails', async () => {
    const { skillsRoot } = await setup()
    const service = new InstallService({
      skillsRoot,
      catalog: { async download() { return version('b', 'Updated') } },
      async writeManifest() {
        throw new Error('disk failure')
      },
    })
    const check = await service.checkUpdate('safe-skill', new AbortController().signal)

    await expect(service.confirm({
      operationId: check.operationId!,
      overwrite: true,
    })).rejects.toMatchObject({ code: 'install-failed' })
    expect(await readFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'utf8'))
      .toContain('Original')
  })

  it('rejects a stale update after the local skill changes', async () => {
    const { skillsRoot } = await setup()
    const service = new InstallService({
      skillsRoot,
      catalog: { async download() { return version('b', 'Updated') } },
    })
    const check = await service.checkUpdate('safe-skill', new AbortController().signal)
    await writeFile(
      join(skillsRoot, 'safe-skill', 'SKILL.md'),
      '---\nname: safe-skill\ndescription: New local edit\n---\n\nDo not overwrite\n',
    )

    await expect(service.confirm({
      operationId: check.operationId!,
      overwrite: true,
    })).rejects.toMatchObject({ code: 'state-changed' })
    expect(await readFile(join(skillsRoot, 'safe-skill', 'SKILL.md'), 'utf8'))
      .toContain('Do not overwrite')
  })
})
