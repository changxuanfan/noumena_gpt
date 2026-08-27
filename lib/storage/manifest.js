import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
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
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isManagedSkillRecord(value) {
    if (!isRecord(value))
        return false;
    return [
        'name',
        'description',
        'catalogId',
        'source',
        'pageUrl',
        'remoteHash',
        'localHash',
        'installedAt',
        'updatedAt',
    ].every(key => typeof value[key] === 'string');
}
function parseManifest(value) {
    if (!isRecord(value)
        || value.version !== MANIFEST_VERSION
        || !isRecord(value.skills)) {
        throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is invalid.');
    }
    const skills = {};
    for (const [key, record] of Object.entries(value.skills)) {
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
    try {
        const text = await readFile(join(managerRoot, 'manifest.json'), 'utf8');
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
