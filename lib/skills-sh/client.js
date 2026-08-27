import { parse } from 'yaml';
const DEFAULT_BASE_URL = 'https://skills.sh';
const DEFAULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 10_000;
const DESCRIPTION_CONCURRENCY = 4;
const SEARCH_RESPONSE_LIMIT_BYTES = 1 * 1024 * 1024;
const SNAPSHOT_RESPONSE_LIMIT_BYTES = 10 * 1024 * 1024;
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
    if (value.skills.length > DEFAULT_LIMIT) {
        throw new SkillsShError('invalid-response', 'Skills.sh returned too many search results.');
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
function parseSkillSnapshot(value) {
    if (!isRecord(value) || typeof value.hash !== 'string') {
        throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid skill snapshot.');
    }
    return {
        hash: value.hash,
        files: [...parseSnapshotFiles(value)],
    };
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
async function readJsonLimited(response, maximumBytes) {
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
        const parsedLength = Number(declaredLength);
        if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
            throw new SkillsShError('invalid-response', 'Skills.sh returned an oversized response.');
        }
    }
    if (response.body === null) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > maximumBytes) {
            throw new SkillsShError('invalid-response', 'Skills.sh returned an oversized response.');
        }
        try {
            return JSON.parse(text);
        }
        catch {
            throw new SkillsShError('invalid-response', 'Skills.sh returned invalid JSON.');
        }
    }
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done)
                break;
            totalBytes += result.value.byteLength;
            if (totalBytes > maximumBytes) {
                await reader.cancel();
                throw new SkillsShError('invalid-response', 'Skills.sh returned an oversized response.');
            }
            chunks.push(result.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        throw new SkillsShError('invalid-response', 'Skills.sh returned invalid JSON.');
    }
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
        const search = await this.requestJson(url, signal, SEARCH_RESPONSE_LIMIT_BYTES);
        const entries = [...parseSearchEntries(search)]
            .sort((left, right) => right.installs - left.installs);
        return mapWithConcurrency(entries, DESCRIPTION_CONCURRENCY, async (entry) => ({
            ...entry,
            description: await this.loadDescription(entry.id, signal),
            pageUrl: new URL(entry.id.split('/').map(encodeURIComponent).join('/'), this.baseUrl).href,
        }));
    }
    async download(id, signal) {
        const catalogId = safeCatalogId(id);
        if (catalogId === null) {
            throw new SkillsShError('invalid-query', 'The catalog skill identifier is invalid.');
        }
        const encodedId = catalogId.split('/').map(encodeURIComponent).join('/');
        const snapshot = await this.requestJson(new URL(`/api/download/${encodedId}`, this.baseUrl), signal, SNAPSHOT_RESPONSE_LIMIT_BYTES);
        return parseSkillSnapshot(snapshot);
    }
    async loadDescription(id, signal) {
        try {
            const encodedId = id.split('/').map(encodeURIComponent).join('/');
            const snapshot = await this.requestJson(new URL(`/api/download/${encodedId}`, this.baseUrl), signal, SNAPSHOT_RESPONSE_LIMIT_BYTES);
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
    async requestJson(url, signal, maximumBytes) {
        const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
        const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
        try {
            const response = await this.fetcher(url, {
                headers: { accept: 'application/json' },
                redirect: 'error',
                signal: combinedSignal,
            });
            if (!response.ok) {
                throw new SkillsShError('upstream', `Skills.sh request failed with status ${response.status}.`, response.status);
            }
            return await readJsonLimited(response, maximumBytes);
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
