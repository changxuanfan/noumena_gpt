import { writeManifestAtomic, type ManagedSkillRecord } from './manifest.ts';
import { type SkillSnapshot } from './snapshot.ts';
import type { UpdateCheckDocument } from '../contracts.ts';
import { MutationLock } from './mutation-lock.ts';
export interface SnapshotCatalog {
    download(id: string, signal: AbortSignal): Promise<SkillSnapshot>;
}
export type InstallCollision = 'none' | 'managed';
export interface PreparedInstall {
    readonly operationId: string;
    readonly name: string;
    readonly description: string;
    readonly source: string;
    readonly pageUrl: string;
    readonly collision: InstallCollision;
    readonly expiresAt: string;
}
export interface ConfirmInstall {
    readonly operationId: string;
    readonly overwrite: boolean;
}
export declare class InstallError extends Error {
    readonly code: 'operation-expired' | 'overwrite-required' | 'unmanaged-collision' | 'install-failed' | 'rollback-failed' | 'unsafe-root' | 'not-managed' | 'state-changed';
    constructor(code: 'operation-expired' | 'overwrite-required' | 'unmanaged-collision' | 'install-failed' | 'rollback-failed' | 'unsafe-root' | 'not-managed' | 'state-changed', message: string, options?: ErrorOptions);
}
export interface InstallServiceOptions {
    readonly skillsRoot: string;
    readonly catalog: SnapshotCatalog;
    readonly now?: () => Date;
    readonly operationTtlMs?: number;
    readonly maxPendingOperations?: number;
    readonly warn?: (message: string, error: unknown) => void;
    readonly writeManifest?: typeof writeManifestAtomic;
    readonly mutationLock?: MutationLock;
}
export declare class InstallService {
    private readonly skillsRoot;
    private readonly catalog;
    private readonly now;
    private readonly operationTtlMs;
    private readonly maxPendingOperations;
    private readonly warn;
    private readonly writeManifest;
    private readonly mutationLock;
    private readonly operations;
    private inFlightPreparations;
    private activeCommits;
    constructor(options: InstallServiceOptions);
    prepare(id: string, signal: AbortSignal): Promise<PreparedInstall>;
    checkUpdate(name: string, signal: AbortSignal): Promise<UpdateCheckDocument>;
    confirm(input: ConfirmInstall): Promise<ManagedSkillRecord>;
    private pruneExpiredOperations;
    private assertOperationCapacity;
    private withPreparationSlot;
    private downloadValidatedSnapshot;
    private storeOperation;
    private collisionFor;
    private commitInstall;
}
