import { lstat, mkdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { MANAGER_DIRECTORY } from './manifest.ts'

export class RootSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RootSafetyError'
  }

  readonly code = 'unsafe-root'
}

export function defaultSkillsRoot(): string {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return resolve(dshHome, 'skills')
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path.length > 0 && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

async function assertDirectoryWithoutSymlink(path: string): Promise<void> {
  const stats = await lstat(path)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new RootSafetyError('A Skill Manager directory is not a safe physical directory.')
  }
}

async function ensureSafeChildDirectory(parent: string, name: string): Promise<string> {
  const requested = join(parent, name)
  try {
    await assertDirectoryWithoutSymlink(requested)
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
    await mkdir(requested, { recursive: false })
    await assertDirectoryWithoutSymlink(requested)
  }

  const physical = await realpath(requested)
  if (dirname(physical) !== parent) {
    throw new RootSafetyError('A Skill Manager directory escapes its physical parent.')
  }
  return physical
}

export async function inspectManagerRoot(skillsRoot: string): Promise<string> {
  const root = resolve(skillsRoot)
  try {
    await assertDirectoryWithoutSymlink(root)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return join(root, MANAGER_DIRECTORY)
    throw error
  }

  const managerRoot = join(root, MANAGER_DIRECTORY)
  try {
    await assertDirectoryWithoutSymlink(managerRoot)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return managerRoot
    throw error
  }
  return managerRoot
}

export async function ensureSafeRoots(skillsRoot: string): Promise<{
  readonly skillsRoot: string
  readonly managerRoot: string
  readonly stagingRoot: string
  readonly backupsRoot: string
}> {
  const requestedRoot = resolve(skillsRoot)
  await mkdir(requestedRoot, { recursive: true })
  await assertDirectoryWithoutSymlink(requestedRoot)

  const requestedManager = join(requestedRoot, MANAGER_DIRECTORY)
  await mkdir(requestedManager, { recursive: true })
  await assertDirectoryWithoutSymlink(requestedManager)

  const physicalRoot = await realpath(requestedRoot)
  const physicalManager = await realpath(requestedManager)
  if (!isInside(physicalRoot, physicalManager)
    || dirname(physicalManager) !== physicalRoot) {
    throw new RootSafetyError('The Skill Manager state directory escapes the DSH Skills Root.')
  }

  const stagingRoot = await ensureSafeChildDirectory(physicalManager, 'staging')
  const backupsRoot = await ensureSafeChildDirectory(physicalManager, 'backups')

  return {
    skillsRoot: physicalRoot,
    managerRoot: physicalManager,
    stagingRoot,
    backupsRoot,
  }
}

export function safeDirectChild(root: string, name: string): string {
  const child = resolve(root, name)
  if (dirname(child) !== root || !isInside(root, child)) {
    throw new RootSafetyError('The skill target escapes the DSH Skills Root.')
  }
  return child
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
