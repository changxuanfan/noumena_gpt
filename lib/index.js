import { mountInstallRoutes } from './install-routes.js';
import { mountInventoryRoute } from './inventory-route.js';
import { mountSearchRoute } from './search-route.js';
import { SkillsShClient } from './skills-sh/client.js';
import { InstallService } from './storage/install-service.js';
import { InventoryService } from './storage/inventory-service.js';
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
            const inventoryService = new InventoryService(defaultSkillsRoot());
            const disposeHealth = mountHealthRoute(host.webServer);
            const disposeSearch = mountSearchRoute(host.webServer, skillsSh);
            const disposeInstall = mountInstallRoutes(host.webServer, installService);
            const disposeInventory = mountInventoryRoute(host.webServer, inventoryService);
            return () => {
                disposeInventory();
                disposeInstall();
                disposeSearch();
                disposeHealth();
            };
        }, 'dsh-skill-manager: http routes');
    });
}
