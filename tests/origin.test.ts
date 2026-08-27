import { describe, expect, it } from 'vitest'
import { isTrustedMutationOrigin } from '../src/install-routes.ts'

describe('mutation origin protection', () => {
  it('accepts a same-origin loopback browser request', () => {
    expect(isTrustedMutationOrigin({
      host: '127.0.0.1:39174',
      origin: 'http://127.0.0.1:39174',
      'sec-fetch-site': 'same-origin',
    })).toBe(true)
  })

  it('rejects DNS-rebinding origins even when Origin matches Host', () => {
    expect(isTrustedMutationOrigin({
      host: 'attacker.example:39174',
      origin: 'http://attacker.example:39174',
      'sec-fetch-site': 'same-origin',
    })).toBe(false)
  })

  it('rejects cross-site requests to a loopback host', () => {
    expect(isTrustedMutationOrigin({
      host: 'localhost:39174',
      origin: 'http://localhost:39174',
      'sec-fetch-site': 'cross-site',
    })).toBe(false)
  })

  it('accepts bracketed IPv6 loopback origins', () => {
    expect(isTrustedMutationOrigin({
      host: '[::1]:39174',
      origin: 'http://[::1]:39174',
      'sec-fetch-site': 'same-origin',
    })).toBe(true)
  })
})
