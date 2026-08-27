import { describe, expect, it } from 'vitest'
import { validateSnapshot } from '../src/storage/snapshot.ts'

const validSkill = `---
name: safe-skill
description: A safe test skill
---

# Safe
`

describe('skill snapshot path safety', () => {
  it.each([
    '../outside.txt',
    'nested/../../outside.txt',
    '/etc/hosts',
    'C:\\Users\\owner\\secret.txt',
    '..\\..\\secret.txt',
    'nested\\secret.txt',
    'nested/\u0000secret.txt',
  ])('rejects unsafe path %s', path => {
    expect(() => validateSnapshot({
      hash: 'a'.repeat(64),
      files: [
        { path: 'SKILL.md', contents: validSkill },
        { path, contents: 'unsafe' },
      ],
    })).toThrowError(expect.objectContaining({ code: 'unsafe-path' }))
  })

  it('rejects paths that collide after case normalization', () => {
    expect(() => validateSnapshot({
      hash: 'a'.repeat(64),
      files: [
        { path: 'SKILL.md', contents: validSkill },
        { path: 'references/Test.md', contents: 'one' },
        { path: 'references/test.md', contents: 'two' },
      ],
    })).toThrowError(expect.objectContaining({ code: 'unsafe-path' }))
  })

  it('requires one root SKILL.md with valid DSH metadata', () => {
    expect(() => validateSnapshot({
      hash: 'a'.repeat(64),
      files: [{ path: 'nested/SKILL.md', contents: validSkill }],
    })).toThrowError(expect.objectContaining({ code: 'invalid-skill' }))
  })

  it('requires a SHA-256 remote snapshot hash', () => {
    expect(() => validateSnapshot({
      hash: 'not-a-sha256',
      files: [{ path: 'SKILL.md', contents: validSkill }],
    })).toThrowError(expect.objectContaining({ code: 'invalid-skill' }))
  })

  it('rejects text that cannot round-trip through UTF-8', () => {
    expect(() => validateSnapshot({
      hash: 'a'.repeat(64),
      files: [
        { path: 'SKILL.md', contents: validSkill },
        { path: 'broken.txt', contents: '\uD800' },
      ],
    })).toThrowError(expect.objectContaining({ code: 'invalid-skill' }))
  })

  it('accepts a valid bounded skill bundle', () => {
    const snapshot = validateSnapshot({
      hash: 'a'.repeat(64),
      files: [
        { path: 'SKILL.md', contents: validSkill },
        { path: 'references/guide.md', contents: '# Guide' },
      ],
    })

    expect(snapshot.name).toBe('safe-skill')
    expect(snapshot.description).toBe('A safe test skill')
    expect(snapshot.files).toHaveLength(2)
    expect(snapshot.localHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
