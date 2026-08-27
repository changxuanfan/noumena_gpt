import { ManifestError } from './storage/manifest.js';
import { RootSafetyError } from './storage/roots.js';
function writeJson(response, status, body) {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify(body));
}
export function mountInventoryRoute(webServer, inventory) {
    return webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/installed',
        async handler(request, response) {
            if (request.method !== 'GET') {
                response.statusCode = 405;
                response.setHeader('allow', 'GET');
                response.end();
                return;
            }
            try {
                writeJson(response, 200, { ok: true, skills: await inventory.list() });
            }
            catch (error) {
                const message = error instanceof ManifestError
                    ? 'The Skill Manager manifest is invalid or unreadable.'
                    : error instanceof RootSafetyError
                        ? 'The DSH Skills Root is not safe to inspect.'
                        : 'The Managed Skill inventory could not be read.';
                writeJson(response, 500, {
                    ok: false,
                    error: { code: 'install-failed', message },
                });
            }
        },
    });
}
