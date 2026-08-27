export interface SnapshotFile {
    path: string;
    contents: string;
}
export interface SkillSnapshot {
    hash: string;
    files: SnapshotFile[];
}
export interface ValidatedSnapshot {
    readonly remoteHash: string;
    readonly localHash: string;
    readonly name: string;
    readonly description: string;
    readonly files: readonly Readonly<SnapshotFile>[];
}
export declare class SnapshotValidationError extends Error {
    readonly code: 'unsafe-path' | 'invalid-skill' | 'resource-limit';
    constructor(code: 'unsafe-path' | 'invalid-skill' | 'resource-limit', message: string);
}
export declare function validateSnapshot(snapshot: SkillSnapshot): ValidatedSnapshot;
