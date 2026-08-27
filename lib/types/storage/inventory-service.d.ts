import type { ManagedSkillInventoryItem } from '../contracts.ts';
export declare class InventoryService {
    private readonly skillsRoot;
    constructor(skillsRoot: string);
    list(): Promise<readonly ManagedSkillInventoryItem[]>;
}
