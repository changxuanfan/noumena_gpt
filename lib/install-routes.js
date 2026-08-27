import { SkillsShError } from './skills-sh/client.js';
import { InstallError } from './storage/install-service.js';
import { ManifestError } from './storage/manifest.js';
import { RootSafetyError } from './storage/roots.js';
import { RemovalError } from './storage/removal-service.js';
import { SnapshotValidationError } from './storage/snapshot.js';
const REQUEST_LIMIT_BYTES = 64 * 1024;
class RequestError extends Error {
    code = 'invalid-request';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
export function isTrustedMutationOrigin(headers) {
    const origin = headers.origin;
    const host = headers.host;
    const fetchSite = headers['sec-fetch-site'];
    if (origin === undefined || host === undefined || fetchSite !== 'same-origin')
        return false;
    try {
        const url = new URL(origin);
        const loopbackHost = url.hostname === 'localhost'
            || url.hostname === '::1'
            || url.hostname === '[::1]'
            || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
        return loopbackHost
            && (url.protocol === 'http:' || url.protocol === 'https:')
            && url.host === host;
    }
    catch {
        return false;
    }
}
async function readJsonBody(request) {
    const contentType = request.headers['content-type'];
    if (typeof contentType !== 'string'
        || !contentType.toLowerCase().startsWith('application/json')) {
        throw new RequestError('A JSON request body is required.');
    }
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += bytes.byteLength;
        if (totalBytes > REQUEST_LIMIT_BYTES) {
            throw new RequestError('The request body is too large.');
        }
        chunks.push(bytes);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new RequestError('The request body is not valid JSON.');
    }
}
export function lifecycleError(error) {
    let code;
    let status;
    let message;
    if (error instanceof RequestError) {
        return { status: 400, error: { code: 'invalid-request', message: error.message } };
    }
    if (error instanceof SnapshotValidationError) {
        code = error.code;
        status = 422;
        message = error.message;
    }
    else if (error instanceof RootSafetyError) {
        code = 'unsafe-root';
        status = 422;
        message = error.message;
    }
    else if (error instanceof InstallError) {
        code = error.code;
        status = error.code === 'not-managed' ? 404
            : error.code === 'operation-expired' ? 410
                : error.code === 'overwrite-required'
                    || error.code === 'unmanaged-collision'
                    || error.code === 'state-changed' ? 409
                    : 500;
        message = error.message;
    }
    else if (error instanceof RemovalError) {
        code = error.code;
        status = error.code === 'not-managed' ? 404
            : error.code === 'operation-expired' ? 410
                : error.code === 'state-changed' ? 409
                    : 500;
        message = error.message;
    }
    else if (error instanceof ManifestError) {
        code = 'install-failed';
        status = 500;
        message = 'The Skill Manager state could not be updated safely.';
    }
    else if (error instanceof SkillsShError) {
        code = error.code === 'invalid-query' ? 'invalid-request'
            : error.code === 'cancelled' ? 'network'
                : error.status === 404 ? 'source-unavailable'
                    : error.code;
        status = code === 'invalid-request' ? 400
            : code === 'rate-limited' ? 429
                : code === 'source-unavailable' ? 404
                    : code === 'timeout' ? 504
                        : 502;
        message = code === 'invalid-request'
            ? 'The catalog skill identifier is invalid.'
            : code === 'source-unavailable'
                ? 'This skill is no longer available on Skills.sh.'
                : error.message;
    }
    else {
        code = 'install-failed';
        status = 500;
        message = 'The skill installation failed unexpectedly.';
    }
    return { status, error: { code, message } };
}
function writeJson(response, status, body) {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify(body));
}
function assertPost(request, response) {
    if (request.method !== 'POST') {
        response.statusCode = 405;
        response.setHeader('allow', 'POST');
        response.end();
        return false;
    }
    if (!isTrustedMutationOrigin(request.headers)) {
        writeJson(response, 403, {
            ok: false,
            error: { code: 'invalid-request', message: 'A same-origin request is required.' },
        });
        return false;
    }
    return true;
}
export function mountInstallRoutes(webServer, service, removal) {
    const disposePrepare = webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/install/prepare',
        async handler(request, response) {
            if (!assertPost(request, response))
                return;
            try {
                const body = await readJsonBody(request);
                if (!isRecord(body) || typeof body.id !== 'string') {
                    throw new RequestError('A catalog skill identifier is required.');
                }
                const prepared = await service.prepare(body.id, new AbortController().signal);
                writeJson(response, 200, { ok: true, prepared });
            }
            catch (error) {
                const failure = lifecycleError(error);
                writeJson(response, failure.status, { ok: false, error: failure.error });
            }
        },
    });
    const disposeConfirm = webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/install/confirm',
        async handler(request, response) {
            if (!assertPost(request, response))
                return;
            try {
                const body = await readJsonBody(request);
                if (!isRecord(body)
                    || typeof body.operationId !== 'string'
                    || typeof body.overwrite !== 'boolean') {
                    throw new RequestError('A prepared operation and overwrite decision are required.');
                }
                const skill = await service.confirm({
                    operationId: body.operationId,
                    overwrite: body.overwrite,
                });
                writeJson(response, 200, { ok: true, skill });
            }
            catch (error) {
                const failure = lifecycleError(error);
                writeJson(response, failure.status, { ok: false, error: failure.error });
            }
        },
    });
    const disposeUpdateCheck = webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/update/check',
        async handler(request, response) {
            if (!assertPost(request, response))
                return;
            try {
                const body = await readJsonBody(request);
                if (!isRecord(body) || typeof body.name !== 'string') {
                    throw new RequestError('A Managed Skill name is required.');
                }
                const update = await service.checkUpdate(body.name, new AbortController().signal);
                writeJson(response, 200, { ok: true, update });
            }
            catch (error) {
                const failure = lifecycleError(error);
                writeJson(response, failure.status, { ok: false, error: failure.error });
            }
        },
    });
    const disposeUpdateConfirm = webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/update/confirm',
        async handler(request, response) {
            if (!assertPost(request, response))
                return;
            try {
                const body = await readJsonBody(request);
                if (!isRecord(body) || typeof body.operationId !== 'string') {
                    throw new RequestError('A prepared update operation is required.');
                }
                const skill = await service.confirm({
                    operationId: body.operationId,
                    overwrite: true,
                });
                writeJson(response, 200, { ok: true, skill });
            }
            catch (error) {
                const failure = lifecycleError(error);
                writeJson(response, failure.status, { ok: false, error: failure.error });
            }
        },
    });
    const disposeRemovalPrepare = webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/remove/prepare',
        async handler(request, response) {
            if (!assertPost(request, response))
                return;
            try {
                const body = await readJsonBody(request);
                if (!isRecord(body) || typeof body.name !== 'string') {
                    throw new RequestError('A Managed Skill name is required.');
                }
                const prepared = await removal.prepare(body.name);
                writeJson(response, 200, { ok: true, prepared });
            }
            catch (error) {
                const failure = lifecycleError(error);
                writeJson(response, failure.status, { ok: false, error: failure.error });
            }
        },
    });
    const disposeRemovalConfirm = webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/api/remove/confirm',
        async handler(request, response) {
            if (!assertPost(request, response))
                return;
            try {
                const body = await readJsonBody(request);
                if (!isRecord(body) || typeof body.operationId !== 'string') {
                    throw new RequestError('A prepared removal operation is required.');
                }
                const name = await removal.confirm(body.operationId);
                writeJson(response, 200, { ok: true, name });
            }
            catch (error) {
                const failure = lifecycleError(error);
                writeJson(response, failure.status, { ok: false, error: failure.error });
            }
        },
    });
    return () => {
        disposeRemovalConfirm();
        disposeRemovalPrepare();
        disposeUpdateConfirm();
        disposeUpdateCheck();
        disposeConfirm();
        disposePrepare();
    };
}
