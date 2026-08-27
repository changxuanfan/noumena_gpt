export class MutationLock {
    tail = Promise.resolve();
    run(operation) {
        const result = this.tail.then(operation, operation);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }
}
