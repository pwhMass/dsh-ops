/** Runtime half of the DSH product adapter. Optional host services stay optional. */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { homedir } from 'node:os'
import { realpathSync } from 'node:fs'
import type { AtomicApi, BootApi, Context } from './types.js'

export interface CarrierHost { boot: BootApi; yaml: typeof import('yaml'); atomic: AtomicApi }

/** Resolve a DSH message constructor only when an admitted message is created. */
export async function loadUserMessage(): Promise<typeof import('@deepseek-ai/dsh-llm').createUserMessage> {
  const llm = await import('@deepseek-ai/dsh-llm')
  return llm.createUserMessage
}

export function service<T>(ctx: Pick<Context, 'get'>, name: string): T | undefined {
  try {
    const value = ctx.get(name as never)
    return value === undefined || value === null ? undefined : value as T
  } catch { return undefined }
}

type Scopes = typeof import('@deepseek-ai/dsh-scope')

/** Whether two file URLs name the same module on disk, whatever their spelling. */
export function sameModule(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false
  if (a === b) return true
  try { return realpathSync.native(fileURLToPath(a)) === realpathSync.native(fileURLToPath(b)) } catch { return false }
}

/** This package's own install root: a copy resolved inside it is never the running host's. */
const packageRoot = new URL('../../../', import.meta.url).href

/** The module the running host was started from, when argv names one (not a single executable). */
export function hostEntry(): string | undefined {
  const entry = process.argv[1]
  return entry !== undefined && path.isAbsolute(entry) ? entry : undefined
}

/** The copy resolved from the host's own entry: the module tree the running process actually uses. */
function hostScopesUrl(): string | undefined {
  const entry = hostEntry()
  if (entry === undefined) return undefined
  try { return pathToFileURL(createRequire(entry).resolve('@deepseek-ai/dsh-scope')).href } catch { return undefined }
}

/** The copy resolved from the profile layer, for hosts that only expose it there. */
function profileScopesUrl(): string | undefined {
  try { return pathToFileURL(createRequire(path.join(profileLayer(), 'package.json')).resolve('@deepseek-ai/dsh-scope')).href } catch { return undefined }
}

/** The profile tree this process serves; a copy resolved there may be another bundle's hoist. */
export function profileLayer(): string {
  return path.join(process.env.DSH_HOME ?? path.join(homedir(), '.dsh'), 'profiles')
}

/**
 * The running host entry through its real path, for a module-resolution anchor.
 *
 * A published bin is a symlink (`bin/dsh` → `lib/bin.js`), and a require
 * anchored on the link resolves from the `bin` directory instead of the host
 * package's module tree. Resolving the link first points the anchor at the host
 * copy every other module in this process uses.
 * @param entry - the entry path; defaults to {@link hostEntry}.
 * @returns the canonical absolute entry, or undefined when there is none.
 */
export function hostEntryAnchor(entry: string | undefined = hostEntry()): string | undefined {
  if (entry === undefined) return undefined
  try { return realpathSync.native(entry) } catch { return undefined }
}

/** Whether one URL sits inside this package's checkout or the profile tree that loads it. */
function untrustedSource(url: string): boolean {
  return url.startsWith(packageRoot) || url.startsWith(`${pathToFileURL(profileLayer()).href}/`)
}

/**
 * Pick which `@deepseek-ai/dsh-scope` copy to load.
 *
 * The package tags a context with `Symbol('dsh.scope')` and keeps ancestry in a
 * module-private `WeakMap`, so a second copy reads neither: `scopeOf` returns
 * `undefined`, every ancestor lookup collapses to the key itself, and session
 * publication fails its scope check. Two copies can shadow the host's when the
 * resolution starts inside a tree that installs its own: a `link:`ed checkout
 * resolves the copy inside that checkout, and a profile install can resolve a
 * copy another bundle hoisted into the profile tree ahead of the host's
 * interception layer. Only those two positions are re-pointed at the host's
 * copy; every other resolution already is the host's. Re-pointing uses the
 * bare URL when both names already agree on the file, so a spelling difference
 * cannot load it twice.
 * @param bare - URL the bare specifier resolves to from this package.
 * @param host - URL the running host entry resolves to, when it resolves one.
 * @param profile - URL the profile layer resolves to, when it resolves one.
 * @returns the URL to import, or `undefined` when no copy can be resolved.
 */
export function chooseScopeSource(bare: string | undefined, host: string | undefined, profile?: string): string | undefined {
  if (bare === undefined) return host ?? profile
  if (!untrustedSource(bare)) return bare
  if (host === undefined) return profile ?? bare
  return sameModule(bare, host) ? bare : host
}

/** A launcher path is discovery evidence, not proof of the active registrar's identity. */
function toolsSources(): string[] {
  const anchors = [import.meta.url, hostEntryAnchor(),
    process.env.DSH_PROFILE_DIR && path.join(process.env.DSH_PROFILE_DIR, 'package.json'),
    path.join(profileLayer(), 'package.json')]
  const sources = new Set<string>()
  for (const anchor of anchors) {
    if (!anchor) continue
    try { sources.add(pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-tools')).href) } catch { /* Optional candidate. */ }
  }
  return [...sources]
}

// Cache only a verified service identity, never an earlier context-free lookup.
const serviceScopes = new WeakMap<object, Scopes>()
const knownServices = new Map<typeof import('@deepseek-ai/dsh-tools').ToolsService, Scopes>()
const scopeUrls = new WeakMap<Scopes, string>()
const admittedScopes = (scopes: Scopes): Promise<Scopes> => import(scopeUrls.get(scopes)!) as Promise<Scopes>

/** Load the scope dependency of the actual tools service, including split CLI/profile trees. */
export async function loadScopes(ctx?: Pick<Context, 'get'>): Promise<Scopes> {
  const tools = ctx && service<object>(ctx, 'tools')
  const cached = tools && serviceScopes.get(tools)
  if (cached) return admittedScopes(cached)
  if (tools) for (const [constructor, scopes] of knownServices) {
    if (tools instanceof constructor) { serviceScopes.set(tools, scopes); return admittedScopes(scopes) }
  }
  const candidates: { matches(tools: object): boolean; scopes: Scopes }[] = []
  if (ctx) for (const source of toolsSources()) {
    try {
      const candidate = await import(source) as typeof import('@deepseek-ai/dsh-tools')
      if (typeof candidate.ToolsService !== 'function' || !candidate.ToolsService.prototype) continue
      const scopeUrl = pathToFileURL(createRequire(source).resolve('@deepseek-ai/dsh-scope')).href
      const scopes = await import(scopeUrl) as Scopes
      scopeUrls.set(scopes, scopeUrl)
      // Cordis Service's instanceof contract recognises its contextual proxies.
      // scopeOf(ctx) alone is not evidence: a second scope copy can tag it too.
      if (tools instanceof candidate.ToolsService) {
        knownServices.set(candidate.ToolsService, scopes)
        serviceScopes.set(tools, scopes)
        return scopes
      }
      candidates.push({ matches: value => {
        try { return value instanceof candidate.ToolsService } catch { return false }
      }, scopes })
    } catch { /* A stale optional module tree must not hide a working candidate. */ }
  }
  const verified = (actual: object): Scopes => {
    const cached = serviceScopes.get(actual)
    if (cached) return cached
    const found = candidates.find(candidate => candidate.matches(actual))?.scopes
    if (!found) throw new Error('Cannot resolve @deepseek-ai/dsh-scope for the active tools service')
    serviceScopes.set(actual, found)
    return found
  }
  if (tools) return verified(tools)
  // Standalone adapter consumers without a tools service retain the legacy lookup.
  // Do not cache it: a later service-backed call must verify the registrar anew.
  let bare: string | undefined
  try { bare = import.meta.resolve('@deepseek-ai/dsh-scope') } catch { bare = undefined }
  const source = chooseScopeSource(bare, hostScopesUrl(), profileScopesUrl())
  if (source === undefined) throw new Error('The host provides no @deepseek-ai/dsh-scope to load')
  const fallback = await import(source) as Scopes
  if (!ctx) return fallback
  // Root registrations may precede tools. Their captured chain functions must
  // resolve the service when used, rather than freeze the provisional module.
  return new Proxy(fallback, { get(target, key) {
    const value = Reflect.get(target, key)
    if (typeof value !== 'function' || !['scopeOf', 'scopeChainOf', 'scopeParentOf', 'bindScopeParent', 'createScope', 'scopeTarget', 'isScopeCarrier', 'carrierKeyOf'].includes(String(key))) return value
    return (...args: unknown[]) => {
      const current = service<object>(ctx, 'tools')
      if (!current && ['scopeOf', 'createScope', 'bindScopeParent', 'scopeTarget'].includes(String(key))) {
        throw new Error('Scope identity requires the active tools service')
      }
      const scopes = current ? verified(current) : fallback
      return Reflect.apply(Reflect.get(scopes, key), undefined, args)
    }
  } })
}

export async function loadCarrierHost(anchor: string): Promise<CarrierHost> {
  if (!path.isAbsolute(anchor)) throw new Error('--host-anchor must be an absolute path to the host package.json.')
  const require = createRequire(anchor)
  const editorRequire = createRequire(require.resolve('@deepseek-ai/dsh-config-editor'))
  const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href) as unknown as BootApi
  const yaml = await import(pathToFileURL(editorRequire.resolve('yaml')).href) as typeof import('yaml')
  const atomic = await import(pathToFileURL(editorRequire.resolve('@deepseek-ai/dsh-atomic-write')).href) as unknown as AtomicApi
  for (const name of ['loadProfileDirectory', 'composeEntries', 'readProfilePatches', 'resolveBundleDir', 'loadOverlayPatches'] as const) {
    if (typeof boot[name] !== 'function') throw new Error(`Host profile API unavailable: ${name}`)
  }
  return { boot, yaml, atomic }
}
