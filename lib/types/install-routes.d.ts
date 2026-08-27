import type { IncomingHttpHeaders } from 'node:http';
import type { PublicError } from './contracts.ts';
import { type InstallService } from './storage/install-service.ts';
import { type RemovalService } from './storage/removal-service.ts';
import type { SearchWebServer } from './search-route.ts';
export declare function isTrustedMutationOrigin(headers: IncomingHttpHeaders): boolean;
export declare function lifecycleError(error: unknown): {
    readonly status: number;
    readonly error: PublicError;
};
export declare function mountInstallRoutes(webServer: SearchWebServer, service: InstallService, removal: RemovalService): () => void;
