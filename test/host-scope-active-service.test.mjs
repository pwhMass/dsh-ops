/* Real, distinct DSH module trees: the launcher must not choose publication scope (#942). */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { assert, test, report, PACKAGE_ROOT, withTempDir } from './lib/harness.mjs'

const require = createRequire(import.meta.url)
const moduleUrl = file => pathToFileURL(path.join(PACKAGE_ROOT, file)).href

await test('real profile registrar, ancestry and publication survive a different global CLI (#942)', () =>
  withTempDir('active-scope-service', async root => {
    // Shared Cordis dependencies, but three independent tools/scope module identities.
    fs.symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    for (const tree of ['launcher', 'profile']) {
      for (const name of ['dsh-tools', 'dsh-scope']) {
        const source = path.resolve(path.dirname(require.resolve(`@deepseek-ai/${name}`)), '..')
        const target = path.join(root, tree, 'node_modules', '@deepseek-ai', name)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.cpSync(source, target, { recursive: true })
      }
    }
    const entry = path.join(root, 'launcher', 'entry.mjs')
    fs.writeFileSync(entry, `
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import GlobalTools from '@deepseek-ai/dsh-tools'
import * as wrongScopes from '@deepseek-ai/dsh-scope'
import ProfileTools from '../profile/node_modules/@deepseek-ai/dsh-tools/lib/index.js'
import * as activeScopes from '../profile/node_modules/@deepseek-ai/dsh-scope/lib/index.js'
import { loadScopes } from ${JSON.stringify(moduleUrl('lib/adapter/dsh/host.js'))}
import { acquire } from ${JSON.stringify(moduleUrl('lib/publication/registrar.js'))}
import { joinIntegration, integrationFor } from ${JSON.stringify(moduleUrl('lib/consumer/registry.js'))}
import { prepareProviders, registerNativeCapability, providers } from ${JSON.stringify(moduleUrl('lib/discovery/providers.js'))}
const root = new Context()
root.logger.level = 0
try {
  await root.plugin(Prompt, {})
  await joinIntegration(root, { preset: 'target', marker: 'global' })
  await prepareProviders(root)
  const earlyParent = {}, earlyChild = {}, sibling = {}
  const earlyScope = activeScopes.createScope(root, earlyParent)
  // Without a registrar, an unverified scope must not be accepted as global.
  await assert.rejects(joinIntegration(earlyScope.ctx, { preset: 'target' }), /active tools service/)
  await registerNativeCapability(earlyScope.ctx, {
    definition: { name: 'early_probe', description: 'probe', parameters: { type: 'object' },
      output: { schema: { type: 'string' }, render: value => value }, execute: async () => 'ok' },
    search: 'probe', authorize: () => true,
  })
  await root.plugin(ProfileTools, {})
  earlyChild.ctx = activeScopes.createScope(earlyScope.ctx, earlyChild, { parent: earlyParent }).ctx
  sibling.ctx = activeScopes.createScope(root, sibling).ctx
  assert.equal(providers(root, earlyChild)[0].scope, earlyParent)
  assert.deepEqual(providers(root, sibling), [])
  const parent = {}, agent = { session: { header: { agentPreset: 'target' } } }
  const outer = activeScopes.createScope(root, parent)
  agent.ctx = activeScopes.createScope(outer.ctx, agent, { parent }).ctx
  await joinIntegration(outer.ctx, { preset: 'target', marker: 'scoped' })
  assert.equal(integrationFor(root, agent).marker, 'scoped')
  await registerNativeCapability(outer.ctx, {
    definition: { name: 'external_probe', description: 'probe', parameters: { type: 'object' },
      output: { schema: { type: 'string' }, render: value => value }, execute: async () => 'ok' },
    search: 'probe', authorize: () => true,
  })
  assert.equal(providers(root, agent)[0].scope, parent)
  // A misleading second tag is nonempty but knows none of the actual parent chain.
  const doublyTagged = wrongScopes.createScope(agent.ctx, agent)
  assert.equal(wrongScopes.scopeOf(doublyTagged.ctx), agent)
  assert.deepEqual(wrongScopes.scopeChainOf(agent), [agent])
  await loadScopes() // A provisional context-free lookup must not poison later calls.
  const actual = await loadScopes(root)
  assert.equal(actual.scopeOf(doublyTagged.ctx), agent)
  assert.deepEqual(actual.scopeChainOf(agent), [agent, parent])
  assert.equal(await loadScopes(agent.ctx), actual)
  const lease = await acquire(agent.ctx, agent, 'scope_probe', {
    description: 'Scope regression probe', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: value => value },
  })
  lease.grant({ consumer: {}, agent, token: {}, entitled: true, dispatch: async () => 'ok' })
  await lease.ready()
  assert.ok(root.get('tools').get('scope_probe', agent))
  assert.equal(root.get('tools').get('scope_probe'), undefined)
  lease.dispose()
  // A different root in the same process may genuinely use the CLI's modules.
  const other = new Context()
  other.logger.level = 0
  try {
    await other.plugin(Prompt, {})
    await other.plugin(GlobalTools, {})
    const scopes = await loadScopes(other)
    assert.notEqual(scopes, actual)
    assert.equal(scopes.scopeOf(wrongScopes.createScope(other, parent).ctx), parent)
  } finally { await other.fiber.dispose() }
  await assert.rejects(loadScopes({ get: () => ({}) }), /active tools service/)
  console.log('real split-tree publication and ancestry passed')
} finally { await root.fiber.dispose() }
`)
    const result = spawnSync(process.execPath, [entry], {
      encoding: 'utf8', timeout: 30_000, env: { ...process.env,
        DSH_PROFILE_DIR: path.join(root, 'profile') },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /real split-tree publication and ancestry passed/)
  }))

report('host-scope-active-service')
