import type { PreparedRemovalDocument } from '../contracts.ts';
import { writeManifestAtomic } from './manifest.ts';
import { MutationLock } from './mutation-lock.ts';
export declare class RemovalError extends Error {
    readonly code: 'not-managed' | 'state-changed' | 'operation-expired' | 'remove-failed' | 'rollback-failed' | 'unsafe-root';
    constructor(code: 'not-managed' | 'state-changed' | 'operation-expired' | 'remove-failed' | 'rollback-failed' | 'unsafe-root', message: string, options?: ErrorOptions);
}
export interface RemovalServiceOptions {
    readonly skillsRoot: string;
    readonly now?: () => Date;
    readonly operationTtlMs?: number;
    readonly maxPendingOperations?: number;
    readonly writeManifest?: typeof writeManifestAtomic;
    readonly mutationLock?: MutationLock;
    readonly warn?: (message: string, error: unknown) => void;
}
export declare class RemovalService {
    private readonly skillsRoot;
    private readonly now;
    private readonly operationTtlMs;
    private readonly maxPendingOperations;
    private readonly writeManifest;
    private readonly mutationLock;
    private readonly warn;
    private readonly operations;
    private inFlightPreparations;
    private activeCommits;
    constructor(options: RemovalServiceOptions);
    prepare(name: string): Promise<PreparedRemovalDocument>;
    confirm(operationId: string): Promise<string>;
    private pruneExpired;
    private commitRemoval;
}
