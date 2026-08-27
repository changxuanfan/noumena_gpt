export declare class RootSafetyError extends Error {
    constructor(message: string);
    readonly code = "unsafe-root";
}
export declare function defaultSkillsRoot(): string;
export declare function inspectManagerRoot(skillsRoot: string): Promise<string>;
export declare function ensureSafeRoots(skillsRoot: string): Promise<{
    readonly skillsRoot: string;
    readonly managerRoot: string;
    readonly stagingRoot: string;
    readonly backupsRoot: string;
}>;
export declare function safeDirectChild(root: string, name: string): string;
