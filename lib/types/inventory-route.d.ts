import type { SearchWebServer } from './search-route.ts';
import type { InventoryService } from './storage/inventory-service.ts';
export declare function mountInventoryRoute(webServer: SearchWebServer, inventory: InventoryService): () => void;
