/* Record the current escaped-Native/literal-edit contract without changing file semantics. */
import fs from 'node:fs'
import path from 'node:path'
import { definition } from '../lib/file/contract.js'
import { assert, test, report, withTempDir } from './lib/harness.mjs'
import { callTool, envelopeOf, requireWorker } from './lib/boundary.mjs'
requireWorker('native-edit-roundtrip-issue939')
const call = async (tool, args, root) => envelopeOf(await callTool(tool, args, { root }), assert)

await test('Native escapes cannot be copied literally into edit_file (#939 reproduction)', async () => {
  await withTempDir('issue939', async root => {
    const target = path.join(root, 'paths.rs')
    const text = String.raw`let dir = PathBuf::from(r"C:\Apps\kaols");`
    fs.writeFileSync(target, text + '\n')
    const args = { path: target }
    const read = await call('inspect_local_file', args, root)
    assert.equal(read.items[0].text, text)
    const rendered = definition('inspect_local_file', async () => read).output.render(args, read)[0].text
    const displayed = text.replaceAll('\\', '\\\\')
    assert.ok(rendered.includes(displayed), rendered)
    const wrong = await call('edit_file', { path: target, expectedRevision: read.revision,
      edits: [{ oldText: displayed, newText: 'changed' }] }, root)
    assert.equal(wrong.status, 'error', JSON.stringify(wrong))
    assert.equal(wrong.error.code, 'EDIT_CONFLICT')
    assert.equal(fs.readFileSync(target, 'utf8'), text + '\n')
    const right = await call('edit_file', { path: target, expectedRevision: read.revision,
      edits: [{ oldText: text, newText: 'changed' }] }, root)
    assert.equal(right.status, 'completed', JSON.stringify(right))
    assert.equal(fs.readFileSync(target, 'utf8'), 'changed\n')
  })
})

report('native-edit-roundtrip-issue939')
