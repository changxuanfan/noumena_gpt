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
        && isSearchErrorCode(value.error.code)
        && typeof value.error.message === 'string';
}
function isSearchErrorCode(value) {
    return value === 'invalid-query'
        || value === 'network'
        || value === 'timeout'
        || value === 'upstream'
        || value === 'invalid-response';
}
function isPublicError(value) {
    return isRecord(value)
        && typeof value.code === 'string'
        && typeof value.message === 'string';
}
function isPreparedInstall(value) {
    if (!isRecord(value))
        return false;
    return typeof value.operationId === 'string'
        && typeof value.name === 'string'
        && typeof value.description === 'string'
        && typeof value.source === 'string'
        && typeof value.pageUrl === 'string'
        && (value.collision === 'none' || value.collision === 'managed')
        && typeof value.expiresAt === 'string';
}
function isManagedSkill(value) {
    if (!isRecord(value))
        return false;
    return [
        'name',
        'description',
        'catalogId',
        'source',
        'pageUrl',
        'remoteHash',
        'localHash',
        'installedAt',
        'updatedAt',
    ].every(key => typeof value[key] === 'string');
}
export function isPrepareInstallEnvelope(value) {
    if (!isRecord(value) || typeof value.ok !== 'boolean')
        return false;
    return value.ok ? isPreparedInstall(value.prepared) : isPublicError(value.error);
}
export function isConfirmInstallEnvelope(value) {
    if (!isRecord(value) || typeof value.ok !== 'boolean')
        return false;
    return value.ok ? isManagedSkill(value.skill) : isPublicError(value.error);
}
