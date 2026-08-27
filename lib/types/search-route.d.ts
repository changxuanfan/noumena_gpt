import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CatalogSkill } from './contracts.ts';
export interface SearchWebServer {
    register(route: {
        kind: 'exact';
        path: string;
        handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
    }): () => void;
}
interface CatalogSearcher {
    search(query: string, signal: AbortSignal): Promise<readonly CatalogSkill[]>;
}
export declare function mountSearchRoute(webServer: SearchWebServer, searcher?: CatalogSearcher): () => void;
export {};
