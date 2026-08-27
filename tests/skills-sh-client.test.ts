import { describe, expect, it } from 'vitest'
import { SkillsShClient, SkillsShError, type Fetcher } from '../src/skills-sh/client.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('SkillsShClient', () => {
  it('normalizes results, sorts installs, and enriches descriptions', async () => {
    const fetcher: Fetcher = async input => {
      const url = new URL(String(input))
      if (url.pathname === '/api/search') {
        return json({
          skills: [
            { id: 'owner/repo/second', name: 'second', source: 'owner/repo', installs: 10 },
            { id: 'owner/repo/first', name: 'first', source: 'owner/repo', installs: 20 },
          ],
        })
      }

      const name = url.pathname.endsWith('/first') ? 'First description' : 'Second description'
      return json({
        hash: 'a'.repeat(64),
        files: [{
          path: 'SKILL.md',
          contents: `---\nname: test\ndescription: ${name}\n---\n`,
        }],
      })
    }

    const client = new SkillsShClient({ fetcher, baseUrl: 'https://skills.sh' })
    const results = await client.search(' test ', new AbortController().signal)

    expect(results).toEqual([
      {
        id: 'owner/repo/first',
        name: 'first',
        description: 'First description',
        source: 'owner/repo',
        installs: 20,
        pageUrl: 'https://skills.sh/owner/repo/first',
      },
      {
        id: 'owner/repo/second',
        name: 'second',
        description: 'Second description',
        source: 'owner/repo',
        installs: 10,
        pageUrl: 'https://skills.sh/owner/repo/second',
      },
    ])
  })

  it('keeps a result when description enrichment fails', async () => {
    const fetcher: Fetcher = async input => {
      const url = new URL(String(input))
      if (url.pathname === '/api/search') {
        return json({
          skills: [{ id: 'owner/repo/skill', name: 'skill', source: 'owner/repo', installs: 1 }],
        })
      }
      return json({ error: 'missing' }, 404)
    }

    const results = await new SkillsShClient({ fetcher }).search(
      'skill',
      new AbortController().signal,
    )
    expect(results[0]?.description).toBeNull()
  })

  it('rejects malformed search data instead of treating it as empty', async () => {
    const fetcher: Fetcher = async () => json({ skills: [{ name: 42 }] })
    const client = new SkillsShClient({ fetcher })

    await expect(client.search('skill', new AbortController().signal))
      .rejects.toMatchObject<Partial<SkillsShError>>({ code: 'invalid-response' })
  })

  it('classifies transport failures', async () => {
    const fetcher: Fetcher = async () => {
      throw new TypeError('offline')
    }
    const client = new SkillsShClient({ fetcher })

    await expect(client.search('skill', new AbortController().signal))
      .rejects.toMatchObject<Partial<SkillsShError>>({ code: 'network' })
  })

  it('rejects redirects at the fetch boundary', async () => {
    let redirect: RequestRedirect | undefined
    const fetcher: Fetcher = async (_input, init) => {
      redirect = init?.redirect
      return json({ skills: [] })
    }

    await new SkillsShClient({ fetcher }).search('skill', new AbortController().signal)
    expect(redirect).toBe('error')
  })

  it('rejects a response whose declared size exceeds the local limit', async () => {
    const fetcher: Fetcher = async () => new Response('{}', {
      headers: { 'content-length': String(2 * 1024 * 1024) },
    })
    const client = new SkillsShClient({ fetcher })

    await expect(client.search('skill', new AbortController().signal))
      .rejects.toMatchObject<Partial<SkillsShError>>({ code: 'invalid-response' })
  })

  it('rejects more results than requested before enrichment', async () => {
    const skills = Array.from({ length: 7 }, (_, index) => ({
      id: `owner/repo/skill-${index}`,
      name: `skill-${index}`,
      source: 'owner/repo',
      installs: index,
    }))
    const fetcher: Fetcher = async () => json({ skills })
    const client = new SkillsShClient({ fetcher })

    await expect(client.search('skill', new AbortController().signal))
      .rejects.toMatchObject<Partial<SkillsShError>>({ code: 'invalid-response' })
  })

  it('limits each search page to six results', async () => {
    let requestedLimit: string | null = null
    const fetcher: Fetcher = async input => {
      const url = new URL(String(input))
      requestedLimit = url.searchParams.get('limit')
      return json({ skills: [] })
    }

    await new SkillsShClient({ fetcher }).search('skill', new AbortController().signal)
    expect(requestedLimit).toBe('6')
  })

  it('reuses an enriched snapshot when installation downloads the same skill', async () => {
    let downloadRequests = 0
    const fetcher: Fetcher = async input => {
      const url = new URL(String(input))
      if (url.pathname === '/api/search') {
        return json({
          skills: [{
            id: 'owner/repo/safe-skill',
            name: 'safe-skill',
            source: 'owner/repo',
            installs: 10,
          }],
        })
      }
      downloadRequests += 1
      return json({
        hash: 'a'.repeat(64),
        files: [{
          path: 'SKILL.md',
          contents: '---\nname: safe-skill\ndescription: Safe skill\n---\n',
        }],
      })
    }
    const client = new SkillsShClient({ fetcher })

    await client.search('safe', new AbortController().signal)
    await client.download('owner/repo/safe-skill', new AbortController().signal)

    expect(downloadRequests).toBe(1)
  })

  it('preserves rate-limit semantics and short-circuits subsequent downloads', async () => {
    let requests = 0
    const fetcher: Fetcher = async () => {
      requests += 1
      return json({
        error: 'rate_limit_exceeded',
        message: 'Rate limit exceeded. Maximum 60 requests per hour.',
      }, 429)
    }
    const client = new SkillsShClient({ fetcher })

    await expect(client.download(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'rate-limited', status: 429 })
    await expect(client.download(
      'owner/repo/another-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'rate-limited', status: 429 })
    expect(requests).toBe(1)
  })

  it('evicts least-recently-used snapshots when the byte budget is exceeded', async () => {
    let requests = 0
    const fetcher: Fetcher = async input => {
      requests += 1
      const id = new URL(String(input)).pathname.split('/').at(-1)
      return json({
        hash: 'a'.repeat(64),
        files: [{
          path: 'SKILL.md',
          contents: `---\nname: ${id}\ndescription: ${'x'.repeat(100)}\n---\n`,
        }],
      })
    }
    const client = new SkillsShClient({
      fetcher,
      snapshotCacheMaxBytes: 250,
    })

    await client.download('owner/repo/first', new AbortController().signal)
    await client.download('owner/repo/second', new AbortController().signal)
    await client.download('owner/repo/first', new AbortController().signal)

    expect(requests).toBe(3)
  })

  it('does not cache a snapshot that fails installation resource validation', async () => {
    let requests = 0
    const fetcher: Fetcher = async () => {
      requests += 1
      return requests === 1
        ? json({
            hash: 'a'.repeat(64),
            files: Array.from({ length: 501 }, (_, index) => ({
              path: index === 0 ? 'SKILL.md' : `references/${index}.md`,
              contents: index === 0
                ? '---\nname: safe-skill\ndescription: Safe\n---\n'
                : 'content',
            })),
          })
        : json({
            hash: 'b'.repeat(64),
            files: [{
              path: 'SKILL.md',
              contents: '---\nname: safe-skill\ndescription: Safe\n---\n',
            }],
          })
    }
    const client = new SkillsShClient({ fetcher })

    await expect(client.download(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'resource-limit' })
    await expect(client.download(
      'owner/repo/safe-skill',
      new AbortController().signal,
    )).resolves.toMatchObject({ hash: 'b'.repeat(64) })
    expect(requests).toBe(2)
  })
})
