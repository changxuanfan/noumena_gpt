import { mountInstallRoutes } from './install-routes.js';
import { mountSearchRoute } from './search-route.js';
import { SkillsShClient } from './skills-sh/client.js';
import { InstallService } from './storage/install-service.js';
import { defaultSkillsRoot } from './storage/roots.js';
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
            const skillsSh = new SkillsShClient();
            const installService = new InstallService({
                skillsRoot: defaultSkillsRoot(),
                catalog: skillsSh,
            });
            const disposeHealth = mountHealthRoute(host.webServer);
            const disposeSearch = mountSearchRoute(host.webServer, skillsSh);
            const disposeInstall = mountInstallRoutes(host.webServer, installService);
            return () => {
                disposeInstall();
                disposeSearch();
                disposeHealth();
            };
        }, 'dsh-skill-manager: http routes');
    });
}
