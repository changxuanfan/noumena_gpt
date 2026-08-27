import { randomUUID } from 'node:crypto';
import { lstat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectManagedSkill, inspectSkillDirectory, } from './inventory-service.js';
import { managedRecordsEqual, readManifest, writeManifestAtomic, } from './manifest.js';
import { MutationLock } from './mutation-lock.js';
import { ensureSafeRoots, inspectManagerRoot, RootSafetyError, safeDirectChild, } from './roots.js';
const DEFAULT_OPERATION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_PENDING_OPERATIONS = 64;
export class RemovalError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'RemovalError';
    }
}
export class RemovalService {
    skillsRoot;
    now;
    operationTtlMs;
    maxPendingOperations;
    writeManifest;
    mutationLock;
    warn;
    operations = new Map();
    inFlightPreparations = 0;
    activeCommits = 0;
    constructor(options) {
        this.skillsRoot = options.skillsRoot;
        this.now = options.now ?? (() => new Date());
        this.operationTtlMs = options.operationTtlMs ?? DEFAULT_OPERATION_TTL_MS;
        this.maxPendingOperations = options.maxPendingOperations ?? DEFAULT_MAX_PENDING_OPERATIONS;
        this.writeManifest = options.writeManifest ?? writeManifestAtomic;
        this.mutationLock = options.mutationLock ?? new MutationLock();
        this.warn = options.warn ?? ((message, error) => console.warn(message, error));
    }
    async prepare(name) {
        this.pruneExpired();
        if (this.operations.size + this.inFlightPreparations + this.activeCommits
            >= this.maxPendingOperations) {
            throw new RemovalError('remove-failed', 'Too many removals are awaiting confirmation.');
        }
        this.inFlightPreparations += 1;
        try {
            const managerRoot = await inspectManagerRoot(this.skillsRoot);
            const manifest = await readManifest(managerRoot);
            const record = Object.hasOwn(manifest.skills, name) ? manifest.skills[name] : undefined;
            if (record === undefined) {
                throw new RemovalError('not-managed', 'The requested skill is not managed by this plugin.');
            }
            const inspection = await inspectManagedSkill(this.skillsRoot, record);
            if (inspection.state === 'invalid' && inspection.currentHash === undefined) {
                throw new RemovalError('remove-failed', 'This invalid skill cannot be fingerprinted safely and must not be removed automatically.');
            }
            const operationId = randomUUID();
            const expiresAt = this.now().getTime() + this.operationTtlMs;
            const expiryTimer = setTimeout(() => {
                this.operations.delete(operationId);
            }, this.operationTtlMs);
            expiryTimer.unref();
            this.operations.set(operationId, {
                record,
                state: inspection.state,
                currentHash: inspection.currentHash,
                expiresAt,
                expiryTimer,
            });
            return {
                operationId,
                name: record.name,
                description: record.description,
                source: record.source,
                state: inspection.state,
                expiresAt: new Date(expiresAt).toISOString(),
            };
        }
        finally {
            this.inFlightPreparations -= 1;
        }
    }
    confirm(operationId) {
        const operation = this.operations.get(operationId);
        this.operations.delete(operationId);
        if (operation !== undefined)
            clearTimeout(operation.expiryTimer);
        if (operation === undefined || operation.expiresAt <= this.now().getTime()) {
            return Promise.reject(new RemovalError('operation-expired', 'The prepared removal expired. Prepare it again.'));
        }
        this.activeCommits += 1;
        return this.mutationLock.run(async () => this.commitRemoval(operation))
            .finally(() => {
            this.activeCommits -= 1;
        });
    }
    pruneExpired() {
        const now = this.now().getTime();
        for (const [id, operation] of this.operations) {
            if (operation.expiresAt > now)
                continue;
            clearTimeout(operation.expiryTimer);
            this.operations.delete(id);
        }
    }
    async commitRemoval(operation) {
        let roots;
        try {
            roots = await ensureSafeRoots(this.skillsRoot);
        }
        catch (error) {
            if (error instanceof RootSafetyError) {
                throw new RemovalError('unsafe-root', error.message, { cause: error });
            }
            throw error;
        }
        const manifest = await readManifest(roots.managerRoot);
        const currentRecord = Object.hasOwn(manifest.skills, operation.record.name)
            ? manifest.skills[operation.record.name]
            : undefined;
        if (currentRecord === undefined || !managedRecordsEqual(currentRecord, operation.record)) {
            throw new RemovalError('state-changed', 'The Managed Skill changed after removal was prepared.');
        }
        const target = safeDirectChild(roots.skillsRoot, currentRecord.name);
        const backup = join(roots.backupsRoot, randomUUID());
        let moved = false;
        let committed = false;
        try {
            try {
                await lstat(target);
                await rename(target, backup);
                moved = true;
            }
            catch (error) {
                if (!isNodeError(error) || error.code !== 'ENOENT')
                    throw error;
            }
            if (moved) {
                const frozenInspection = await inspectSkillDirectory(backup, currentRecord);
                if (frozenInspection.state !== operation.state
                    || frozenInspection.currentHash !== operation.currentHash) {
                    throw new RemovalError('state-changed', 'The Managed Skill changed after removal was prepared.');
                }
            }
            else if (operation.state !== 'missing') {
                throw new RemovalError('state-changed', 'The Managed Skill changed after removal was prepared.');
            }
            const remainingSkills = Object.fromEntries(Object.entries(manifest.skills).filter(([name]) => name !== currentRecord.name));
            await this.writeManifest(roots.managerRoot, {
                version: 1,
                skills: remainingSkills,
            });
            committed = true;
        }
        catch (error) {
            try {
                if (moved)
                    await rename(backup, target);
            }
            catch (rollbackError) {
                throw new RemovalError('rollback-failed', 'Removal failed and automatic rollback did not complete.', { cause: new AggregateError([error, rollbackError]) });
            }
            if (error instanceof RemovalError)
                throw error;
            throw new RemovalError('remove-failed', 'The Managed Skill could not be removed.', {
                cause: error,
            });
        }
        if (committed && moved) {
            try {
                await rm(backup, { recursive: true, force: true });
            }
            catch (cleanupError) {
                this.warn('The skill was removed, but its in-root recovery backup could not be deleted.', cleanupError);
            }
        }
        return currentRecord.name;
    }
}
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
