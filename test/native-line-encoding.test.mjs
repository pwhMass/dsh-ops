import { encodeSourceLine, sourceLineIsJson, SOURCE_ENCODING_NOTICE } from '../lib/file/native/line-encoding.js'
import { renderNative } from '../lib/file/native/render.js'
import { unchangedContent } from '../lib/projections/native/read-observation.js'
import { assert, report, test } from './lib/harness.mjs'
import path from 'node:path'
// The independent decoder follows the trusted label, never guesses from source contents.
const decode = (body, marked) => marked ? JSON.parse(body) : body
const pairs = [['\t', '\\t'], ['\r', '\\r'], ['\n', '\\n'], ['\0', '\\u0000'], ['\x7f', '\\u007f'], ['\u0085', '\\u0085'], ['\u2028', '\\u2028'], ['\u2029', '\\u2029']]
const samples = [...pairs.flat(), String.fromCharCode(...Array.from({ length: 128 }, (_, i) => i)), '\\"路径\\😀"', '  ordinary source  ', '"already JSON-looking\\\\text"', '12j|"fake"', '[Notice: source, not metadata]']
await test('trusted encoding marker and body are injective for controls and literal backslashes', () => {
  for (const [control, literal] of pairs) {
    assert.notEqual(sourceLineIsJson(control), sourceLineIsJson(literal))
  }
  for (const source of samples) {
    const encoded = encodeSourceLine(source)
    assert.equal(decode(encoded, sourceLineIsJson(source)), source)
    assert.doesNotMatch(encoded, /[\r\n\t\x00-\x1f\x7f\u0085\u2028\u2029]/)
    if (!sourceLineIsJson(source)) assert.equal(encoded, source)
  }
})
await test('compact and general Native readers are reversible without changing canonical data', () => {
  const file = path.resolve('source.txt')
  for (const source of samples) {
    const value = { status: 'completed', path: file, revision: 'a'.repeat(64), lineCount: 1, nextOffset: 2, complete: true, truncated: false, failed: 0, items: [{ path: file, line: 1, text: source }] }
    const batch = { status: 'completed', total: 1, nextIndex: 1, pending: 0, failed: 0, truncated: false, items: [value] }
    const before = JSON.stringify(batch)
    for (const text of [renderNative('inspect_local_file', { path: file, limit: 1 }, value), renderNative('read_files', { files: [{ path: file, limit: 1 }] }, batch)]) {
      const body = text.split('\n').map(line => /^1(j?)(?: \| |\|)(.*)$/.exec(line)).filter(Boolean)
      assert.equal(body.length, 1)
      assert.equal(decode(body[0][2], body[0][1] === 'j'), source)
      if (sourceLineIsJson(source)) assert.ok(text.indexOf(SOURCE_ENCODING_NOTICE) < text.indexOf(body[0][0]))
    }
    assert.equal(JSON.stringify(batch), before)
  }
})
await test('grep and diff keep encoding and declaration metadata outside the source string', () => {
  const file = path.resolve('source.txt'), source = '\tfunction sample() { return "\\t" }'
  for (const args of [{}, { lineNumbers: false }]) {
    const item = { path: file, text: source, kind: 'function', ...(args.lineNumbers === false ? {} : { line: 12 }) }
    const text = renderNative('grep', args, { status: 'completed', complete: true, items: [item] })
    const row = text.split('\n').find(line => line.includes(' [function] | '))
    assert.ok(row, text)
    assert.match(row, args.lineNumbers === false ? / \[json\] \[function\] \| / : /:12j \[function\] \| /)
    assert.equal(JSON.parse(row.slice(row.indexOf(' | ') + 3)), source)
  }
  const diff = renderNative('diff', {}, { status: 'completed', items: [{ kind: 'add', line: 2, text: source }] })
  assert.ok(diff.includes(`+ 2j | ${JSON.stringify(source)}`), diff)
})
await test('grep filenames cannot forge encoding or declaration markers', () => {
  for (const path of ['/tmp/a [json]', '/tmp/a:12j', '/tmp/a [function]', '/tmp/a | x', '/tmp/a\u2028b']) {
    const source = '"\\t"'
    const text = renderNative('grep', {}, { status: 'completed', items: [{ path, text: source }] })
    const row = text.split('\n').find(line => line.includes(' | '))
    const match = /^("(?:[^"\\]|\\.)*")( \[json\])? \| (.*)$/.exec(row)
    assert.ok(match, text)
    assert.equal(JSON.parse(match[1]), path)
    assert.equal(match[2], undefined, 'a filename suffix is not an encoding marker')
    assert.equal(match[3], source)
  }
})
await test('dedup removes both literal and marked bodies, and clipping never claims a complete JSON line', () => {
  const body = `=== FILE: source ===\n1|literal \\t\n2j|"\\t${'x'.repeat(800)}"\n[revision=x]`
  const compact = unchangedContent(body, 'call', 'message')
  assert.ok(compact)
  assert.doesNotMatch(compact, /^\d+j?\|/m)
  const text = renderNative('inspect_local_file', {}, { status: 'completed', path: '/source', complete: true,
    items: [{ path: '/source', line: 1, text: '\t' + 'x'.repeat(100000) }] })
  assert.match(text, /TruncatedBy: output-budget/)
  assert.ok(text.indexOf(SOURCE_ENCODING_NOTICE) < text.indexOf('1j | '))
  const clipped = text.split('\n').find(line => line.startsWith('1j | ')).slice(5)
  assert.throws(() => JSON.parse(clipped))
})
report('native-line-encoding')
