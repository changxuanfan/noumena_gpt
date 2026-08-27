import { type ManagedSkillRecord } from './manifest.ts';
import { type SkillSnapshot } from './snapshot.ts';
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
    readonly code: 'operation-expired' | 'overwrite-required' | 'unmanaged-collision' | 'install-failed' | 'rollback-failed' | 'unsafe-root';
    constructor(code: 'operation-expired' | 'overwrite-required' | 'unmanaged-collision' | 'install-failed' | 'rollback-failed' | 'unsafe-root', message: string, options?: ErrorOptions);
}
export interface InstallServiceOptions {
    readonly skillsRoot: string;
    readonly catalog: SnapshotCatalog;
    readonly now?: () => Date;
    readonly operationTtlMs?: number;
    readonly maxPendingOperations?: number;
    readonly warn?: (message: string, error: unknown) => void;
}
export declare class InstallService {
    private readonly skillsRoot;
    private readonly catalog;
    private readonly now;
    private readonly operationTtlMs;
    private readonly maxPendingOperations;
    private readonly warn;
    private readonly operations;
    private inFlightPreparations;
    private activeCommits;
    private writeTail;
    constructor(options: InstallServiceOptions);
    prepare(id: string, signal: AbortSignal): Promise<PreparedInstall>;
    confirm(input: ConfirmInstall): Promise<ManagedSkillRecord>;
    private enqueue;
    private pruneExpiredOperations;
    private collisionFor;
    private commitInstall;
}
