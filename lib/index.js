import { mountSearchRoute } from './search-route.js';
export const name = 'dsh-skill-manager';
export function healthDocument() {
    return { ok: true, service: name };
}
export function mountHealthRoute(webServer) {
    return webServer.register({
        kind: 'exact',
        path: '/dsh-skill-manager/health',
        handler(request, response) {
            if (request.method !== 'GET') {
                response.statusCode = 405;
                response.setHeader('allow', 'GET');
                response.end();
                return;
            }
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(healthDocument()));
        },
    });
}
export function apply(ctx) {
    ctx.inject(['webServer'], (scopedContext) => {
        const host = scopedContext;
        host.effect(() => {
            const disposeHealth = mountHealthRoute(host.webServer);
            const disposeSearch = mountSearchRoute(host.webServer);
            return () => {
                disposeSearch();
                disposeHealth();
            };
        }, 'dsh-skill-manager: http routes');
    });
}
