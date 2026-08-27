import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export const MANAGER_DIRECTORY = '.dsh-skill-manager';
export const MANIFEST_VERSION = 1;
export class ManifestError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'ManifestError';
    }
}
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_MANIFEST_BYTES = 1 * 1024 * 1024;
const MAX_MANAGED_SKILLS = 500;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isManagedSkillRecord(value) {
    if (!isRecord(value))
        return false;
    if (typeof value.name !== 'string'
        || !SKILL_NAME.test(value.name)
        || typeof value.description !== 'string'
        || typeof value.catalogId !== 'string'
        || value.catalogId.length === 0
        || typeof value.source !== 'string'
        || value.source.length === 0
        || typeof value.pageUrl !== 'string'
        || typeof value.remoteHash !== 'string'
        || !SHA256.test(value.remoteHash)
        || typeof value.localHash !== 'string'
        || !SHA256.test(value.localHash)
        || typeof value.installedAt !== 'string'
        || !Number.isFinite(Date.parse(value.installedAt))
        || typeof value.updatedAt !== 'string'
        || !Number.isFinite(Date.parse(value.updatedAt))) {
        return false;
    }
    try {
        const pageUrl = new URL(value.pageUrl);
        return pageUrl.protocol === 'https:' && pageUrl.hostname === 'skills.sh';
    }
    catch {
        return false;
    }
}
function parseManifest(value) {
    if (!isRecord(value)
        || value.version !== MANIFEST_VERSION
        || !isRecord(value.skills)) {
        throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is invalid.');
    }
    const skills = {};
    const entries = Object.entries(value.skills);
    if (entries.length > MAX_MANAGED_SKILLS) {
        throw new ManifestError('manifest-invalid', 'The Skill Manager manifest contains too many skills.');
    }
    for (const [key, record] of entries) {
        if (!isManagedSkillRecord(record) || key !== record.name) {
            throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is invalid.');
        }
        skills[key] = record;
    }
    return {
        version: MANIFEST_VERSION,
        skills,
    };
}
export function emptyManifest() {
    return { version: MANIFEST_VERSION, skills: {} };
}
export async function readManifest(managerRoot) {
    let handle;
    try {
        handle = await open(join(managerRoot, 'manifest.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_MANIFEST_BYTES) {
            throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is oversized.');
        }
        const buffer = Buffer.allocUnsafe(MAX_MANIFEST_BYTES + 1);
        let offset = 0;
        while (offset < buffer.byteLength) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
            if (bytesRead === 0)
                break;
            offset += bytesRead;
            if (offset > MAX_MANIFEST_BYTES) {
                throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is oversized.');
            }
        }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
        return parseManifest(JSON.parse(text));
    }
    catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT')
            return emptyManifest();
        if (error instanceof ManifestError)
            throw error;
        if (error instanceof SyntaxError) {
            throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is not valid JSON.');
        }
        throw new ManifestError('manifest-io', 'The Skill Manager manifest could not be read.', {
            cause: error,
        });
    }
    finally {
        await handle?.close();
    }
}
export async function writeManifestAtomic(managerRoot, manifest) {
    const temporaryPath = join(managerRoot, 'staging', `manifest-${randomUUID()}.json`);
    try {
        await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600,
        });
        await rename(temporaryPath, join(managerRoot, 'manifest.json'));
    }
    catch (error) {
        throw new ManifestError('manifest-io', 'The Skill Manager manifest could not be written.', {
            cause: error,
        });
    }
}
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
