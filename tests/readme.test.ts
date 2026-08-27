import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('README installation flow', () => {
  it('documents the pnpm prerequisite before the DSH install command', async () => {
    const readme = await readFile(join(process.cwd(), 'README.md'), 'utf8')
    const corepackSetup = readme.indexOf('corepack enable pnpm')
    const pnpmVerification = readme.indexOf('pnpm --version')
    const pluginInstall = readme.indexOf(
      'dsh plugin --profile web add github:changxuanfan/noumena_gpt#v0.1.1',
    )

    expect(corepackSetup).toBeGreaterThan(-1)
    expect(pnpmVerification).toBeGreaterThan(corepackSetup)
    expect(pluginInstall).toBeGreaterThan(pnpmVerification)
  })
})
