import type { ManagedSkillInventoryItem } from '../contracts.ts';
import { type ManagedSkillRecord } from './manifest.ts';
export interface ManagedSkillInspection {
    readonly state: ManagedSkillInventoryItem['state'];
    readonly currentHash?: string;
}
export declare function inspectManagedSkill(skillsRoot: string, record: ManagedSkillRecord): Promise<ManagedSkillInspection>;
export declare class InventoryService {
    private readonly skillsRoot;
    constructor(skillsRoot: string);
    list(): Promise<readonly ManagedSkillInventoryItem[]>;
}
