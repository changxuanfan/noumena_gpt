import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile, } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readManifest, writeManifestAtomic, } from './manifest.js';
import { inspectManagedSkill } from './inventory-service.js';
import { ensureSafeRoots, inspectManagerRoot, RootSafetyError, safeDirectChild, } from './roots.js';
import { SnapshotValidationError, validateSnapshot, } from './snapshot.js';
const DEFAULT_OPERATION_TTL_MS = 5 * 60 * 1000;
const MAX_PREPARED_OPERATIONS = 64;
export class InstallError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'InstallError';
    }
}
export class InstallService {
    skillsRoot;
    catalog;
    now;
    operationTtlMs;
    maxPendingOperations;
    warn;
    writeManifest;
    operations = new Map();
    inFlightPreparations = 0;
    activeCommits = 0;
    writeTail = Promise.resolve();
    constructor(options) {
        this.skillsRoot = options.skillsRoot;
        this.catalog = options.catalog;
        this.now = options.now ?? (() => new Date());
        this.operationTtlMs = options.operationTtlMs ?? DEFAULT_OPERATION_TTL_MS;
        this.maxPendingOperations = options.maxPendingOperations ?? MAX_PREPARED_OPERATIONS;
        this.warn = options.warn ?? ((message, error) => console.warn(message, error));
        this.writeManifest = options.writeManifest ?? writeManifestAtomic;
    }
    async prepare(id, signal) {
        this.pruneExpiredOperations();
        return this.withPreparationSlot(async () => {
            const snapshot = await this.downloadValidatedSnapshot(id, signal);
            const managerRoot = await inspectManagerRoot(this.skillsRoot);
            const manifest = await readManifest(managerRoot);
            const collision = await this.collisionFor(snapshot.name, manifest);
            if (collision === 'unmanaged') {
                throw new InstallError('unmanaged-collision', 'A user-owned skill already uses this name and cannot be overwritten.');
            }
            const { operationId, expiresAt } = this.storeOperation(id, snapshot);
            return {
                operationId,
                name: snapshot.name,
                description: snapshot.description,
                source: sourceFromCatalogId(id),
                pageUrl: pageUrlFromCatalogId(id),
                collision,
                expiresAt: new Date(expiresAt).toISOString(),
            };
        });
    }
    async checkUpdate(name, signal) {
        this.pruneExpiredOperations();
        return this.withPreparationSlot(async () => {
            const managerRoot = await inspectManagerRoot(this.skillsRoot);
            const manifest = await readManifest(managerRoot);
            const record = Object.hasOwn(manifest.skills, name) ? manifest.skills[name] : undefined;
            if (record === undefined) {
                throw new InstallError('not-managed', 'The requested skill is not managed by this plugin.');
            }
            const local = await inspectManagedSkill(this.skillsRoot, record);
            let snapshot;
            try {
                snapshot = await this.downloadValidatedSnapshot(record.catalogId, signal);
            }
            catch (error) {
                if (hasStatus(error, 404)) {
                    return { name, status: 'source-unavailable', updateAvailable: false };
                }
                throw error;
            }
            if (snapshot.name !== name) {
                throw new SnapshotValidationError('invalid-skill', 'The updated snapshot no longer matches the Managed Skill name.');
            }
            const localStatus = local.state === 'current'
                ? 'current'
                : local.state === 'locally-modified'
                    ? 'locally-modified'
                    : 'local-invalid';
            if (snapshot.remoteHash === record.remoteHash || local.currentHash === undefined) {
                return { name, status: localStatus, updateAvailable: false };
            }
            const baseline = {
                record,
                currentHash: local.currentHash,
            };
            const { operationId, expiresAt } = this.storeOperation(record.catalogId, snapshot, baseline);
            return {
                name,
                status: localStatus === 'current' ? 'available' : localStatus,
                updateAvailable: true,
                operationId,
                expiresAt: new Date(expiresAt).toISOString(),
            };
        });
    }
    confirm(input) {
        const operation = this.operations.get(input.operationId);
        this.operations.delete(input.operationId);
        if (operation !== undefined)
            clearTimeout(operation.expiryTimer);
        if (operation === undefined || operation.expiresAt <= this.now().getTime()) {
            return Promise.reject(new InstallError('operation-expired', 'The prepared installation expired. Prepare it again.'));
        }
        this.activeCommits += 1;
        return this.enqueue(async () => this.commitInstall(operation, input.overwrite))
            .finally(() => {
            this.activeCommits -= 1;
        });
    }
    enqueue(operation) {
        const result = this.writeTail.then(operation, operation);
        this.writeTail = result.then(() => undefined, () => undefined);
        return result;
    }
    pruneExpiredOperations() {
        const now = this.now().getTime();
        for (const [operationId, operation] of this.operations) {
            if (operation.expiresAt > now)
                continue;
            clearTimeout(operation.expiryTimer);
            this.operations.delete(operationId);
        }
    }
    assertOperationCapacity() {
        if (this.operations.size + this.inFlightPreparations + this.activeCommits
            >= this.maxPendingOperations) {
            throw new InstallError('install-failed', 'Too many skill operations are awaiting confirmation. Try again shortly.');
        }
    }
    async withPreparationSlot(operation) {
        this.assertOperationCapacity();
        this.inFlightPreparations += 1;
        try {
            return await operation();
        }
        finally {
            this.inFlightPreparations -= 1;
        }
    }
    async downloadValidatedSnapshot(id, signal) {
        return validateSnapshot(await this.catalog.download(id, signal));
    }
    storeOperation(id, snapshot, baseline) {
        const operationId = randomUUID();
        const expiresAt = this.now().getTime() + this.operationTtlMs;
        const expiryTimer = setTimeout(() => {
            this.operations.delete(operationId);
        }, this.operationTtlMs);
        expiryTimer.unref();
        this.operations.set(operationId, {
            id,
            snapshot,
            expiresAt,
            expiryTimer,
            baseline,
        });
        return { operationId, expiresAt };
    }
    async collisionFor(name, manifest) {
        const target = safeDirectChild(this.skillsRoot, name);
        try {
            const stats = await lstat(target);
            if (!stats.isDirectory() || stats.isSymbolicLink())
                return 'unmanaged';
            return Object.hasOwn(manifest.skills, name) ? 'managed' : 'unmanaged';
        }
        catch (error) {
            if (isNodeError(error) && error.code === 'ENOENT')
                return 'none';
            throw error;
        }
    }
    async commitInstall(operation, overwrite) {
        let roots;
        try {
            roots = await ensureSafeRoots(this.skillsRoot);
        }
        catch (error) {
            if (error instanceof RootSafetyError) {
                throw new InstallError('unsafe-root', error.message, { cause: error });
            }
            throw error;
        }
        const manifest = await readManifest(roots.managerRoot);
        if (operation.baseline !== undefined) {
            const baselineRecord = Object.hasOwn(manifest.skills, operation.snapshot.name)
                ? manifest.skills[operation.snapshot.name]
                : undefined;
            if (baselineRecord === undefined
                || !sameManagedRecord(baselineRecord, operation.baseline.record)) {
                throw new InstallError('state-changed', 'The Managed Skill changed after the update check. Check again.');
            }
            const current = await inspectManagedSkill(roots.skillsRoot, baselineRecord);
            if (current.currentHash !== operation.baseline.currentHash) {
                throw new InstallError('state-changed', 'The Managed Skill changed after the update check. Check again.');
            }
        }
        const collision = await this.collisionFor(operation.snapshot.name, manifest);
        if (collision === 'unmanaged') {
            throw new InstallError('unmanaged-collision', 'A user-owned skill already uses this name and cannot be overwritten.');
        }
        if (collision === 'managed' && !overwrite) {
            throw new InstallError('overwrite-required', 'This Managed Skill already exists and requires overwrite confirmation.');
        }
        const stage = join(roots.stagingRoot, operationIdSegment());
        const backup = join(roots.backupsRoot, operationIdSegment());
        const target = safeDirectChild(roots.skillsRoot, operation.snapshot.name);
        let existingMoved = false;
        let targetClaimed = false;
        try {
            await writeStage(stage, operation.snapshot);
            if (collision === 'managed') {
                await rename(target, backup);
                existingMoved = true;
            }
            await mkdir(target, { recursive: false });
            targetClaimed = true;
            await writeSnapshotContents(target, operation.snapshot, true);
            const timestamp = this.now().toISOString();
            const previous = Object.hasOwn(manifest.skills, operation.snapshot.name)
                ? manifest.skills[operation.snapshot.name]
                : undefined;
            const record = {
                name: operation.snapshot.name,
                description: operation.snapshot.description,
                catalogId: operation.id,
                source: sourceFromCatalogId(operation.id),
                pageUrl: pageUrlFromCatalogId(operation.id),
                remoteHash: operation.snapshot.remoteHash,
                localHash: operation.snapshot.localHash,
                installedAt: previous?.installedAt ?? timestamp,
                updatedAt: timestamp,
            };
            await this.writeManifest(roots.managerRoot, {
                version: 1,
                skills: { ...manifest.skills, [record.name]: record },
            });
            try {
                await rm(stage, { recursive: true, force: true });
            }
            catch (cleanupError) {
                this.warn('The skill was installed, but its in-root staging copy could not be removed.', cleanupError);
            }
            if (existingMoved) {
                try {
                    await rm(backup, { recursive: true, force: true });
                }
                catch (cleanupError) {
                    this.warn('The skill was installed, but its in-root recovery backup could not be removed.', cleanupError);
                }
            }
            return record;
        }
        catch (error) {
            try {
                if (targetClaimed)
                    await rm(target, { recursive: true, force: true });
                if (existingMoved)
                    await rename(backup, target);
                await rm(stage, { recursive: true, force: true });
            }
            catch (rollbackError) {
                throw new InstallError('rollback-failed', 'Installation failed and automatic rollback did not complete.', { cause: new AggregateError([error, rollbackError]) });
            }
            if (error instanceof InstallError
                || error instanceof SnapshotValidationError
                || error instanceof RootSafetyError) {
                throw error;
            }
            throw new InstallError('install-failed', 'The skill could not be installed.', {
                cause: error,
            });
        }
    }
}
async function writeStage(stage, snapshot) {
    await mkdir(stage, { recursive: false });
    await writeSnapshotContents(stage, snapshot, false);
}
async function writeSnapshotContents(root, snapshot, skillFileLast) {
    const files = skillFileLast
        ? [...snapshot.files].sort((left, right) => {
            if (left.path === 'SKILL.md')
                return 1;
            if (right.path === 'SKILL.md')
                return -1;
            return left.path.localeCompare(right.path);
        })
        : snapshot.files;
    for (const file of files) {
        const destination = join(root, ...file.path.split('/'));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, file.contents, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600,
        });
    }
}
function operationIdSegment() {
    return randomUUID();
}
function sourceFromCatalogId(id) {
    return id.split('/').slice(0, -1).join('/');
}
function pageUrlFromCatalogId(id) {
    return `https://skills.sh/${id.split('/').map(encodeURIComponent).join('/')}`;
}
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
function hasStatus(error, status) {
    return error instanceof Error
        && 'status' in error
        && error.status === status;
}
function sameManagedRecord(left, right) {
    return left.name === right.name
        && left.description === right.description
        && left.catalogId === right.catalogId
        && left.source === right.source
        && left.pageUrl === right.pageUrl
        && left.remoteHash === right.remoteHash
        && left.localHash === right.localHash
        && left.installedAt === right.installedAt
        && left.updatedAt === right.updatedAt;
}
