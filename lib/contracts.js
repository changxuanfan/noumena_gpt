function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
export function isCatalogSkill(value) {
    if (!isRecord(value))
        return false;
    return typeof value.id === 'string'
        && typeof value.name === 'string'
        && (typeof value.description === 'string' || value.description === null)
        && typeof value.source === 'string'
        && typeof value.installs === 'number'
        && Number.isFinite(value.installs)
        && typeof value.pageUrl === 'string';
}
export function isSearchEnvelope(value) {
    if (!isRecord(value) || typeof value.ok !== 'boolean')
        return false;
    if (value.ok)
        return Array.isArray(value.results) && value.results.every(isCatalogSkill);
    return isRecord(value.error)
        && typeof value.error.code === 'string'
        && typeof value.error.message === 'string';
}
