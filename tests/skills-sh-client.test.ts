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
        hash: 'snapshot',
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
})
