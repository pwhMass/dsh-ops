/** Ordinary source stays literal; only physically unsafe lines use a marked JSON string. */
const controls = /[\r\n\t\x00-\x1f\x7f\u0085\u2028\u2029]/
export const SOURCE_ENCODING_NOTICE = '[Source encoding: j after a line number, or [json] after an unnumbered grep path, marks a JSON string. Decode that complete string before editing; unmarked source is literal. Incomplete displayed lines are not safe to copy.]'
export function sourceLineIsJson(value: string): boolean { return controls.test(value) }
export function encodeSourceLine(value: string): string {
  if (!sourceLineIsJson(value)) return value
  return JSON.stringify(value).replace(/[\x7f\u0085\u2028\u2029]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}
/** Put the encoding marker in the trusted label, never inside source content. */
export function sourceLineNumber(number: string | number, value: string): string {
  return `${number}${sourceLineIsJson(value) ? 'j' : ''}`
}
