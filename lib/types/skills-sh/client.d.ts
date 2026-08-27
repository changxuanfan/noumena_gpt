import type { CatalogSkill, SearchErrorCode } from '../contracts.ts';
import type { SkillSnapshot } from '../storage/snapshot.ts';
export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare class SkillsShError extends Error {
    readonly code: SearchErrorCode | 'cancelled';
    readonly status?: number | undefined;
    constructor(code: SearchErrorCode | 'cancelled', message: string, status?: number | undefined);
}
export interface SkillsShClientOptions {
    readonly fetcher?: Fetcher;
    readonly baseUrl?: string;
    readonly timeoutMs?: number;
}
export declare class SkillsShClient {
    private readonly fetcher;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(options?: SkillsShClientOptions);
    search(query: string, signal: AbortSignal): Promise<readonly CatalogSkill[]>;
    download(id: string, signal: AbortSignal): Promise<SkillSnapshot>;
    private loadDescription;
    private requestJson;
}
