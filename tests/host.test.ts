import { describe, expect, it, vi } from 'vitest'
import { healthDocument, mountHealthRoute } from '../src/index.ts'

describe('host entry', () => {
  it('publishes a stable health document', () => {
    expect(healthDocument()).toEqual({
      ok: true,
      service: 'dsh-skill-manager',
    })
  })

  it('registers an exact health route and returns its disposer', () => {
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)

    expect(mountHealthRoute({ register })).toBe(dispose)
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'exact',
      path: '/dsh-skill-manager/health',
      handler: expect.any(Function),
    }))
  })
})
