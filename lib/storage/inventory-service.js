import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readManifest } from './manifest.js';
import { inspectManagerRoot, safeDirectChild } from './roots.js';
import { computeSnapshotHash, SnapshotValidationError, validateSnapshot, } from './snapshot.js';
const MAX_FILES = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 1_000;
const MAX_DEPTH = 20;
class InvalidLocalSkillError extends Error {
}
async function collectFiles(root, directory, relativeDirectory, state, depth) {
    if (depth > MAX_DEPTH) {
        throw new InvalidLocalSkillError('A Managed Skill exceeds the directory depth limit.');
    }
    const entries = await opendir(directory);
    for await (const entry of entries) {
        state.entries += 1;
        if (state.entries > MAX_ENTRIES) {
            throw new InvalidLocalSkillError('A Managed Skill exceeds the entry limit.');
        }
        const relativePath = relativeDirectory.length === 0
            ? entry.name
            : `${relativeDirectory}/${entry.name}`;
        const absolutePath = join(directory, entry.name);
        const stats = await lstat(absolutePath);
        if (stats.isSymbolicLink()) {
            throw new InvalidLocalSkillError('Managed Skills cannot contain symbolic links.');
        }
        if (stats.isDirectory()) {
            const physicalDirectory = await realpath(absolutePath);
            const fromRoot = relative(root, physicalDirectory);
            if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
                throw new InvalidLocalSkillError('A Managed Skill directory escapes its root.');
            }
            await collectFiles(root, physicalDirectory, relativePath, state, depth + 1);
            continue;
        }
        if (!stats.isFile()) {
            throw new InvalidLocalSkillError('A Managed Skill contains an unsupported local file.');
        }
        let handle;
        try {
            handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
            const descriptorStats = await handle.stat();
            if (!descriptorStats.isFile() || descriptorStats.size > MAX_FILE_BYTES) {
                throw new InvalidLocalSkillError('A Managed Skill contains an oversized local file.');
            }
            const bytes = await readBoundedFile(handle);
            state.totalBytes += bytes.byteLength;
            if (state.totalBytes > MAX_TOTAL_BYTES || state.files.length >= MAX_FILES) {
                throw new InvalidLocalSkillError('A Managed Skill exceeds local verification limits.');
            }
            let contents;
            try {
                contents = new TextDecoder('utf-8', {
                    fatal: true,
                    ignoreBOM: true,
                }).decode(bytes);
            }
            catch {
                throw new InvalidLocalSkillError('A Managed Skill contains a non-UTF-8 file.');
            }
            state.files.push({ path: relativePath, contents });
        }
        finally {
            await handle?.close();
        }
    }
}
async function readBoundedFile(handle) {
    const buffer = Buffer.allocUnsafe(MAX_FILE_BYTES + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
        if (bytesRead === 0)
            return buffer.subarray(0, offset);
        offset += bytesRead;
        if (offset > MAX_FILE_BYTES) {
            throw new InvalidLocalSkillError('A Managed Skill contains an oversized local file.');
        }
    }
    throw new InvalidLocalSkillError('A Managed Skill contains an oversized local file.');
}
export async function inspectManagedSkill(skillsRoot, record) {
    const target = safeDirectChild(skillsRoot, record.name);
    return inspectSkillDirectory(target, record);
}
export async function inspectSkillDirectory(target, record) {
    try {
        const stats = await lstat(target);
        if (!stats.isDirectory() || stats.isSymbolicLink())
            return { state: 'invalid' };
        const physicalTarget = await realpath(target);
        const collection = { files: [], totalBytes: 0, entries: 0 };
        await collectFiles(physicalTarget, physicalTarget, '', collection, 0);
        const currentHash = computeSnapshotHash(collection.files);
        let snapshot;
        try {
            snapshot = validateSnapshot({
                hash: record.remoteHash,
                files: collection.files,
            });
        }
        catch (error) {
            if (error instanceof SnapshotValidationError) {
                return { state: 'invalid', currentHash };
            }
            throw error;
        }
        if (snapshot.name !== record.name)
            return { state: 'invalid', currentHash };
        return {
            state: snapshot.localHash === record.localHash ? 'current' : 'locally-modified',
            currentHash: snapshot.localHash,
        };
    }
    catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT')
            return { state: 'missing' };
        if (error instanceof InvalidLocalSkillError)
            return { state: 'invalid' };
        throw error;
    }
}
export class InventoryService {
    skillsRoot;
    constructor(skillsRoot) {
        this.skillsRoot = skillsRoot;
    }
    async list() {
        const managerRoot = await inspectManagerRoot(this.skillsRoot);
        const manifest = await readManifest(managerRoot);
        const items = [];
        for (const record of Object.values(manifest.skills)) {
            const inspection = await inspectManagedSkill(this.skillsRoot, record);
            items.push({
                ...record,
                state: inspection.state,
            });
        }
        return items.sort((left, right) => left.name.localeCompare(right.name));
    }
}
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
