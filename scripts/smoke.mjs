const baseUrl = new URL(process.env.DSH_SKILL_MANAGER_URL ?? 'http://127.0.0.1:39177')
const query = process.env.DSH_SKILL_MANAGER_QUERY ?? 'react'
const catalogId = process.env.DSH_SKILL_MANAGER_SKILL
  ?? 'vercel-labs/agent-skills/vercel-react-best-practices'

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), init)
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${path} returned non-JSON status ${response.status}: ${text.slice(0, 200)}`)
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(`${path} failed with status ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

async function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: baseUrl.origin,
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

console.log(`Smoke testing ${baseUrl.origin}`)

const health = await request('/dsh-skill-manager/health')
assert(health.service === 'dsh-skill-manager', 'Unexpected health service identity.')
console.log('1/7 Host health route passed')

const search = await request(`/dsh-skill-manager/api/search?q=${encodeURIComponent(query)}`)
assert(Array.isArray(search.results) && search.results.length > 0, 'Search returned no results.')
assert(search.results.some(skill => skill.id === catalogId), `Search did not include ${catalogId}.`)
console.log(`2/7 Skills.sh search returned ${search.results.length} normalized results`)

const preparation = await post('/dsh-skill-manager/api/install/prepare', { id: catalogId })
assert(typeof preparation.prepared?.operationId === 'string', 'Install preparation returned no token.')
assert(
  preparation.prepared.collision === 'none',
  `Smoke profile already manages ${preparation.prepared.name}; refusing to overwrite or remove it.`,
)
console.log(`3/7 Prepared installation for ${preparation.prepared.name}`)

let verificationError
let confirmationAttempted = false
try {
  confirmationAttempted = true
  const installation = await post('/dsh-skill-manager/api/install/confirm', {
    operationId: preparation.prepared.operationId,
    overwrite: false,
  })
  assert(installation.skill?.catalogId === catalogId, 'Installed skill provenance does not match.')
  console.log(`4/7 Installed ${installation.skill.name}`)

  const inventory = await request('/dsh-skill-manager/api/installed')
  const installed = inventory.skills?.find(skill => skill.catalogId === catalogId)
  assert(installed?.state === 'current', 'Installed skill is not current in the managed inventory.')
  console.log('5/7 Managed inventory verified the installed files')

  const update = await post('/dsh-skill-manager/api/update/check', {
    name: installed.name,
  })
  assert(update.update?.status === 'current', `Expected current update state, got ${update.update?.status}.`)
  console.log('6/7 Update check reported the installed snapshot as current')
} catch (error) {
  verificationError = error
}

let cleanupError
try {
  if (confirmationAttempted) {
    const inventory = await request('/dsh-skill-manager/api/installed')
    const installed = inventory.skills?.find(skill => skill.catalogId === catalogId)
    if (installed !== undefined) {
      const removal = await post('/dsh-skill-manager/api/remove/prepare', {
        name: installed.name,
      })
      await post('/dsh-skill-manager/api/remove/confirm', {
        operationId: removal.prepared.operationId,
      })
    }
    const finalInventory = await request('/dsh-skill-manager/api/installed')
    assert(
      !finalInventory.skills?.some(skill => skill.catalogId === catalogId),
      'Removed skill remains in the managed inventory.',
    )
    console.log('7/7 Confirmed removal and clean final inventory passed')
  }
} catch (error) {
  cleanupError = error
}

if (verificationError !== undefined && cleanupError !== undefined) {
  throw new AggregateError(
    [verificationError, cleanupError],
    'Smoke verification and cleanup both failed.',
  )
}
if (verificationError !== undefined) throw verificationError
if (cleanupError !== undefined) throw cleanupError
console.log('DSH Skill Manager smoke test passed')
