/** POSIX byte-limit regressions for both replacement and create-only staging. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assert, report, skipSuite, test, withTempDir } from './lib/harness.mjs'
import { callTool, envelopeOf, requireWorker } from './lib/boundary.mjs'

if (process.platform === 'win32') skipSuite('long-basename-mutations', 'POSIX byte limits; NTFS measures UTF-16 code units')
requireWorker('long-basename-mutations')

const hash = value => createHash('sha256').update(value).digest('hex')
const uuid = '00000000-0000-4000-8000-000000000000'
const temporary = (name, tail = uuid) => `.dsh-ops-tmp-${hash(name.toLowerCase())}-${tail}`
const lock = name => `.dsh-ops-update-${hash(name.toLowerCase())}.lock`
const nameOf = (unit, bytes) => {
  const budget = bytes - 4
  const width = Buffer.byteLength(unit)
  const name = `${unit.repeat(Math.floor(budget / width))}${'a'.repeat(budget % width)}.txt`
  assert.equal(Buffer.byteLength(name), bytes)
  return name
}
const call = async (tool, args, root, options = {}) => envelopeOf(await callTool(tool, args, {
  root, writeRoots: [root], ...options,
}), assert)
const completed = (answer, target, content) => {
  assert.equal(answer.status, 'completed', JSON.stringify(answer))
  assert.equal(fs.readFileSync(target, 'utf8'), content)
  if (answer.revision !== undefined) assert.equal(answer.revision, hash(content))
}
const clean = (root, names) => assert.deepEqual(fs.readdirSync(root).sort(), [...names].sort(), 'no staging or lock residue')

for (const [kind, unit] of [['ASCII', 'a'], ['CJK', '中'], ['emoji', '😀']]) {
  for (const bytes of [209, 210, 255]) {
    await test(`${bytes}-byte ${kind} basenames support create, overwrite, edit, replace and copy`, async () => {
      await withTempDir('long-basename', async root => {
        const name = nameOf(unit, bytes)
        const target = path.join(root, name)
        completed(await call('write_file', { path: target, expectedRevision: 'absent', content: 'alpha\n' }, root), target, 'alpha\n')
        clean(root, [name])
        fs.chmodSync(target, 0o600)
        completed(await call('write_file', { path: target, expectedRevision: hash('alpha\n'), content: 'beta\n' }, root), target, 'beta\n')
        clean(root, [name])
        completed(await call('edit_file', { path: target, expectedRevision: hash('beta\n'), edits: [{ oldText: 'beta', newText: 'gamma' }] }, root), target, 'gamma\n')
        clean(root, [name])
        completed(await call('replace', { path: target, pattern: 'gamma', replacement: 'delta' }, root), target, 'delta\n')
        assert.equal(fs.statSync(target).mode & 0o777, 0o600, 'atomic publication preserves private mode')
        clean(root, [name])
        const copies = path.join(root, 'copies')
        fs.mkdirSync(copies)
        const dest = path.join(copies, name)
        completed(await call('copy', { path: target, to: dest, expectedRevision: hash('delta\n') }, root), dest, 'delta\n')
        clean(root, [name, 'copies'])
        clean(copies, [name])
        const refused = await call('copy', { path: target, to: dest, expectedRevision: hash('delta\n') }, root)
        assert.equal(refused.error?.code, 'REVISION_CONFLICT')
        assert.equal(refused.error.effectState, 'none')
        assert.equal(fs.readFileSync(dest, 'utf8'), 'delta\n')
        clean(copies, [name])
      })
    })
  }
}

await test('long-name refusals and dry runs create no lock or temporary and do not follow links', async () => {
  await withTempDir('long-basename-policy', async root => {
    const name = nameOf('中', 255)
    const target = path.join(root, name)
    fs.writeFileSync(target, 'original\n')
    const args = { path: target, expectedRevision: hash('original\n'), content: 'next\n' }
    for (const [options, expected] of [[{ readOnly: true }, 'POLICY_DENIED'], [{ writeRoots: [] }, 'POLICY_DENIED']]) {
      const answer = await call('write_file', args, root, options)
      assert.equal(answer.error?.code, expected, JSON.stringify(answer))
      assert.equal(answer.error.effectState, 'none')
      clean(root, [name])
    }
    assert.equal((await call('write_file', { ...args, expectedRevision: hash('stale') }, root)).error?.code, 'REVISION_CONFLICT')
    assert.equal((await call('write_file', { ...args, dryRun: true }, root)).dryRun, true)
    clean(root, [name])
    assert.equal(fs.readFileSync(target, 'utf8'), 'original\n')
    const alias = nameOf('😀', 255)
    fs.symlinkSync(target, path.join(root, alias))
    const linked = await call('write_file', { ...args, path: path.join(root, alias) }, root)
    assert.equal(linked.error?.code, 'PATH_RESTRICTED', JSON.stringify(linked))
    assert.equal(fs.readFileSync(target, 'utf8'), 'original\n')
    clean(root, [name, alias])
    fs.unlinkSync(path.join(root, alias))
    // A hostile update sidecar must never be followed or used as the lock inode.
    fs.symlinkSync(target, path.join(root, lock(name)))
    const fenced = await call('write_file', args, root)
    assert.equal(fenced.status, 'error', JSON.stringify(fenced))
    assert.equal(fenced.error.effectState, 'none')
    assert.equal(fs.readFileSync(target, 'utf8'), 'original\n')
    clean(root, [name, lock(name)])
  })
})

await test('cleanup removes only complete own hashed or legacy temporaries', async () => {
  await withTempDir('long-basename-cleanup', async root => {
    const name = 'notes.txt'
    const target = path.join(root, name)
    const own = [temporary(name), `.${name}.dsh-ops-${uuid}`]
    const preserved = [temporary('other.txt'), `.${name}.dsh-ops-personal-backup`, `${temporary(name)}-backup`, `.foo.dsh-ops-bar.dsh-ops-${uuid}`]
    fs.writeFileSync(target, 'before\n')
    for (const entry of [...own, ...preserved]) fs.writeFileSync(path.join(root, entry), entry)
    completed(await call('write_file', { path: target, expectedRevision: hash('before\n'), content: 'after\n' }, root), target, 'after\n')
    clean(root, [name, ...preserved])
    for (const entry of preserved) assert.equal(fs.readFileSync(path.join(root, entry), 'utf8'), entry)
    // Create-only publication uses the same cleanup, including long target names.
    const long = nameOf('😀', 255)
    fs.writeFileSync(path.join(root, temporary(long)), 'unpublished')
    completed(await call('write_file', { path: path.join(root, long), expectedRevision: 'absent', content: 'created\n' }, root), path.join(root, long), 'created\n')
    clean(root, [name, long, ...preserved])
  })
})

await test('new and legacy temporaries stay outside search even with includeHidden and explicit paths', async () => {
  await withTempDir('long-basename-hidden', async root => {
    const name = nameOf('中', 255)
    const hidden = [temporary(name), `.short.txt.dsh-ops-${uuid}`, lock(name)]
    const visible = ['visible.txt', '.dsh-ops-tmp-deadbeef-backup', '.short.txt.dsh-ops-aaaaaaa中aaaaaaaaaaaaaaaaaaaaaaaaaaaa']
    for (const entry of [...hidden, ...visible]) fs.writeFileSync(path.join(root, entry), 'TOKEN\n')
    for (const tool of ['glob', 'grep']) {
      const args = tool === 'glob' ? { pattern: ['**/*'], includeHidden: true } : { pattern: 'TOKEN', includeHidden: true }
      const answer = await call(tool, { path: root, ...args }, root)
      assert.equal(answer.status, 'completed', JSON.stringify(answer))
      const names = answer.items.map(item => path.basename(typeof item === 'string' ? item : item.path)).sort()
      assert.deepEqual(names, [...visible].sort())
      for (const entry of hidden) {
        const refused = await call(tool, { path: path.join(root, entry), ...args }, root)
        assert.equal(refused.error?.code, 'PATH_RESTRICTED', JSON.stringify(refused))
      }
    }
    const replaced = await call('replace', { path: root, pattern: 'TOKEN', replacement: 'DONE' }, root)
    assert.equal(replaced.status, 'completed', JSON.stringify(replaced))
    for (const entry of hidden) assert.equal(fs.readFileSync(path.join(root, entry), 'utf8'), 'TOKEN\n')
    clean(root, [...hidden, ...visible])
  })
})

report('long-basename-mutations')
