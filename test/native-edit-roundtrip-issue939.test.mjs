/* Native source is literal unless its trusted line label explicitly selects JSON. */
import fs from 'node:fs'
import path from 'node:path'
import { definition } from '../lib/file/contract.js'
import { assert, test, report, withTempDir } from './lib/harness.mjs'
import { callTool, envelopeOf, requireWorker } from './lib/boundary.mjs'
requireWorker('native-edit-roundtrip-issue939')
const call = async (tool, args, root) => envelopeOf(await callTool(tool, args, { root }), assert)
const samples = [String.raw`let dir = PathBuf::from(r"C:\Apps\kaols");`, String.raw`const seq = "\t\n\u2028\\";`, String.raw`\\server\share\path`, '"already JSON-like\\\\source"', '\tlet dir = "C:\\Apps";', 'const mixed = "\\t";\t// tab', 'one\u2028two']

for (const [index, text] of samples.entries()) await test(`Native body round-trips into literal edit_file without guessing (${index}, #939)`, async () => {
  await withTempDir('issue939', async root => {
    const target = path.join(root, 'paths.rs')
    fs.writeFileSync(target, text + '\n')
    const args = { path: target }
    const read = await call('inspect_local_file', args, root)
    assert.equal(read.items[0].text, text)
    const rendered = definition('inspect_local_file', async () => read).output.render(args, read)[0].text
    const row = /^1(j?) \| (.*)$/m.exec(rendered)
    assert.ok(row, rendered)
    const copied = row[1] === 'j' ? JSON.parse(row[2]) : row[2]
    assert.equal(copied, text)
    if (!/[\r\n\t\x00-\x1f\x7f\u0085\u2028\u2029]/.test(text)) {
      assert.equal(row[1], '')
      assert.equal(row[2], text, 'ordinary source is copyable, including backslashes')
    }
    const right = await call('edit_file', { path: target, expectedRevision: read.revision,
      edits: [{ oldText: copied, newText: 'changed' }] }, root)
    assert.equal(right.status, 'completed', JSON.stringify(right))
    assert.equal(fs.readFileSync(target, 'utf8'), 'changed\n')
  })
})
await test('edit_file never auto-unescapes a mismatching oldText (#939)', async () => {
  await withTempDir('issue939-literal', async root => {
    const target = path.join(root, 'literal.txt'), text = String.raw`path C:\Apps\kaols`
    fs.writeFileSync(target, text)
    const read = await call('inspect_local_file', { path: target }, root)
    const wrong = await call('edit_file', { path: target, expectedRevision: read.revision,
      edits: [{ oldText: text.replaceAll('\\', '\\\\'), newText: 'wrong' }] }, root)
    assert.equal(wrong.status, 'error')
    assert.equal(wrong.error.code, 'EDIT_CONFLICT')
    assert.equal(fs.readFileSync(target, 'utf8'), text)
  })
})
report('native-edit-roundtrip-issue939')
