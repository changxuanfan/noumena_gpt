export declare const MANAGER_DIRECTORY = ".dsh-skill-manager";
export declare const MANIFEST_VERSION = 1;
export interface ManagedSkillRecord {
    readonly name: string;
    readonly description: string;
    readonly catalogId: string;
    readonly source: string;
    readonly pageUrl: string;
    readonly remoteHash: string;
    readonly localHash: string;
    readonly installedAt: string;
    readonly updatedAt: string;
}
export interface SkillManifest {
    readonly version: typeof MANIFEST_VERSION;
    readonly skills: Readonly<Record<string, ManagedSkillRecord>>;
}
export declare class ManifestError extends Error {
    readonly code: 'manifest-invalid' | 'manifest-io';
    constructor(code: 'manifest-invalid' | 'manifest-io', message: string, options?: ErrorOptions);
}
export declare function emptyManifest(): SkillManifest;
export declare function readManifest(managerRoot: string): Promise<SkillManifest>;
export declare function writeManifestAtomic(managerRoot: string, manifest: SkillManifest): Promise<void>;
