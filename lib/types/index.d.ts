import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-skill-manager";
interface WebServerService {
    register(route: {
        kind: 'exact';
        path: string;
        handler: (request: IncomingMessage, response: ServerResponse) => void;
    }): () => void;
}
export interface HealthDocument {
    readonly ok: true;
    readonly service: typeof name;
}
export declare function healthDocument(): HealthDocument;
export declare function mountHealthRoute(webServer: WebServerService): () => void;
export declare function apply(ctx: Context): void;
export {};
