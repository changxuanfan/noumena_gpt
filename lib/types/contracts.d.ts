export interface CatalogSkill {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly source: string;
    readonly installs: number;
    readonly pageUrl: string;
}
export type SearchErrorCode = 'invalid-query' | 'network' | 'timeout' | 'upstream' | 'invalid-response';
export type LifecycleErrorCode = 'invalid-request' | 'unsafe-path' | 'invalid-skill' | 'resource-limit' | 'operation-expired' | 'overwrite-required' | 'unmanaged-collision' | 'install-failed' | 'rollback-failed' | 'unsafe-root';
export type PublicErrorCode = SearchErrorCode | LifecycleErrorCode;
export interface PublicError<Code extends PublicErrorCode = PublicErrorCode> {
    readonly code: Code;
    readonly message: string;
}
export type SearchEnvelope = {
    readonly ok: true;
    readonly results: readonly CatalogSkill[];
} | {
    readonly ok: false;
    readonly error: PublicError<SearchErrorCode>;
};
export interface PreparedInstallDocument {
    readonly operationId: string;
    readonly name: string;
    readonly description: string;
    readonly source: string;
    readonly pageUrl: string;
    readonly collision: 'none' | 'managed';
    readonly expiresAt: string;
}
export interface ManagedSkillDocument {
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
export type ManagedSkillState = 'current' | 'locally-modified' | 'missing' | 'invalid';
export interface ManagedSkillInventoryItem extends ManagedSkillDocument {
    readonly state: ManagedSkillState;
}
export type InventoryEnvelope = {
    readonly ok: true;
    readonly skills: readonly ManagedSkillInventoryItem[];
} | {
    readonly ok: false;
    readonly error: PublicError;
};
export type PrepareInstallEnvelope = {
    readonly ok: true;
    readonly prepared: PreparedInstallDocument;
} | {
    readonly ok: false;
    readonly error: PublicError;
};
export type ConfirmInstallEnvelope = {
    readonly ok: true;
    readonly skill: ManagedSkillDocument;
} | {
    readonly ok: false;
    readonly error: PublicError;
};
export declare function isCatalogSkill(value: unknown): value is CatalogSkill;
export declare function isSearchEnvelope(value: unknown): value is SearchEnvelope;
export declare function isPrepareInstallEnvelope(value: unknown): value is PrepareInstallEnvelope;
export declare function isConfirmInstallEnvelope(value: unknown): value is ConfirmInstallEnvelope;
export declare function isInventoryEnvelope(value: unknown): value is InventoryEnvelope;
