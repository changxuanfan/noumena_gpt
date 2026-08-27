import type { IncomingHttpHeaders } from 'node:http';
import { type InstallService } from './storage/install-service.ts';
import type { SearchWebServer } from './search-route.ts';
export declare function isTrustedMutationOrigin(headers: IncomingHttpHeaders): boolean;
export declare function mountInstallRoutes(webServer: SearchWebServer, service: InstallService): () => void;
