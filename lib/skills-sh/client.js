import { parse } from 'yaml';
const DEFAULT_BASE_URL = 'https://skills.sh';
const DEFAULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 10_000;
const DESCRIPTION_CONCURRENCY = 4;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
export class SkillsShError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'SkillsShError';
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function cleanDisplayText(value, maximumLength) {
    return value.replace(CONTROL_CHARACTERS, '').trim().slice(0, maximumLength);
}
function safeCatalogId(value) {
    const id = cleanDisplayText(value, 300);
    const segments = id.split('/');
    if (segments.length < 3)
        return null;
    if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..'))
        return null;
    return id;
}
function parseSearchEntries(value) {
    if (!isRecord(value) || !Array.isArray(value.skills)) {
        throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid search response.');
    }
    return value.skills.map((entry) => {
        if (!isRecord(entry)
            || typeof entry.id !== 'string'
            || typeof entry.name !== 'string'
            || typeof entry.source !== 'string'
            || typeof entry.installs !== 'number'
            || !Number.isFinite(entry.installs)
            || entry.installs < 0) {
            throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid search result.');
        }
        const id = safeCatalogId(entry.id);
        const name = cleanDisplayText(entry.name, 200);
        const source = cleanDisplayText(entry.source, 200);
        if (id === null || name.length === 0 || source.length === 0) {
            throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid search result.');
        }
        return {
            id,
            name,
            source,
            installs: Math.trunc(entry.installs),
        };
    });
}
function parseSnapshotFiles(value) {
    if (!isRecord(value) || !Array.isArray(value.files)) {
        throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid skill snapshot.');
    }
    return value.files.map((file) => {
        if (!isRecord(file) || typeof file.path !== 'string' || typeof file.contents !== 'string') {
            throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid skill snapshot.');
        }
        return { path: file.path, contents: file.contents };
    });
}
function descriptionFromSkillMarkdown(markdown) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
    if (match === null)
        return null;
    try {
        const frontmatter = parse(match[1]);
        if (!isRecord(frontmatter) || typeof frontmatter.description !== 'string')
            return null;
        const description = cleanDisplayText(frontmatter.description, 500);
        return description.length === 0 ? null : description;
    }
    catch {
        return null;
    }
}
async function mapWithConcurrency(values, concurrency, mapper) {
    const results = new Array(values.length);
    let cursor = 0;
    async function worker() {
        while (cursor < values.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(values[index]);
        }
    }
    const workerCount = Math.min(concurrency, values.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}
export class SkillsShClient {
    fetcher;
    baseUrl;
    timeoutMs;
    constructor(options = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    async search(query, signal) {
        const normalizedQuery = query.trim();
        if (normalizedQuery.length === 0) {
            throw new SkillsShError('invalid-query', 'Enter a search keyword.');
        }
        const url = new URL('/api/search', this.baseUrl);
        url.searchParams.set('q', normalizedQuery);
        url.searchParams.set('limit', String(DEFAULT_LIMIT));
        const search = await this.requestJson(url, signal);
        const entries = [...parseSearchEntries(search)]
            .sort((left, right) => right.installs - left.installs);
        return mapWithConcurrency(entries, DESCRIPTION_CONCURRENCY, async (entry) => ({
            ...entry,
            description: await this.loadDescription(entry.id, signal),
            pageUrl: new URL(entry.id.split('/').map(encodeURIComponent).join('/'), this.baseUrl).href,
        }));
    }
    async loadDescription(id, signal) {
        try {
            const encodedId = id.split('/').map(encodeURIComponent).join('/');
            const snapshot = await this.requestJson(new URL(`/api/download/${encodedId}`, this.baseUrl), signal);
            const files = parseSnapshotFiles(snapshot);
            const skillFile = files.find(file => /(^|\/)skill\.md$/i.test(file.path));
            return skillFile === undefined ? null : descriptionFromSkillMarkdown(skillFile.contents);
        }
        catch (error) {
            if (error instanceof SkillsShError && error.code === 'cancelled')
                throw error;
            return null;
        }
    }
    async requestJson(url, signal) {
        const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
        const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
        try {
            const response = await this.fetcher(url, {
                headers: { accept: 'application/json' },
                signal: combinedSignal,
            });
            if (!response.ok) {
                throw new SkillsShError('upstream', `Skills.sh request failed with status ${response.status}.`, response.status);
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof SkillsShError)
                throw error;
            if (signal.aborted) {
                throw new SkillsShError('cancelled', 'The request was cancelled.');
            }
            if (timeoutSignal.aborted) {
                throw new SkillsShError('timeout', 'Skills.sh did not respond in time.');
            }
            throw new SkillsShError('network', 'Unable to reach Skills.sh.');
        }
    }
}
