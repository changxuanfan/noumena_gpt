export declare class MutationLock {
    private tail;
    run<T>(operation: () => Promise<T>): Promise<T>;
}
