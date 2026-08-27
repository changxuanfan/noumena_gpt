import { afterEach, describe, expect, it } from 'vitest'
import { installStyles, STYLE_ID } from '../src/client/styles.ts'

afterEach(() => {
  document.querySelectorAll(`style[data-plugin-css="${STYLE_ID}"]`)
    .forEach(element => element.remove())
})

describe('Skill Manager styles', () => {
  it('installs one plugin-owned style element and disposes it', () => {
    const dispose = installStyles()
    const style = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)

    expect(style).not.toBeNull()
    expect(style?.getAttribute('data-plugin')).toBe('dsh-skill-manager')

    installStyles()
    expect(document.querySelectorAll(`style[data-plugin-css="${STYLE_ID}"]`)).toHaveLength(1)
    dispose()
    expect(document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)).toBeNull()
  })
})
