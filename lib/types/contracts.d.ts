export interface CatalogSkill {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly source: string;
    readonly installs: number;
    readonly pageUrl: string;
}
export type SearchErrorCode = 'invalid-query' | 'network' | 'timeout' | 'upstream' | 'invalid-response';
export interface PublicError {
    readonly code: SearchErrorCode;
    readonly message: string;
}
export type SearchEnvelope = {
    readonly ok: true;
    readonly results: readonly CatalogSkill[];
} | {
    readonly ok: false;
    readonly error: PublicError;
};
export declare function isCatalogSkill(value: unknown): value is CatalogSkill;
export declare function isSearchEnvelope(value: unknown): value is SearchEnvelope;
