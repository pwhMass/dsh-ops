# Local dsh-ops validation status

Updated: 2026-11-17 (Asia/Shanghai).

## Scope

Local evaluation and bug-fix candidate against upstream `58f6e2817618fae52476e8c7f1920aaeb4421c7a` (package version 0.5.5). The running DSH Web profile was not modified, installed into, or restarted. No upstream issue, comment or pull request was published.

## Completed

- Reproduced issue #942 with a global launcher and a separate active profile tools/scope tree. The new regression fails on the original adapter (`launcher` selected instead of `active`).
- Implemented active `ToolsService` module identity selection for scope helpers; passed real split-tree registration, ancestry, multiple-root, damaged-candidate and early-registration isolation tests.
- Verified an isolated root using the installed DSH 0.2.2-rc.2 modules can register an agent-scoped tool, keep it absent globally, and clean up.
- Reproduced #939 using the published worker: Native backslash escaping copied literally to `edit_file` returns `EDIT_CONFLICT`; canonical original text edits correctly. The encoding/edit contract is not changed by this patch.
- Added English/Chinese host integration and changelog notes.

## Final validation

- Build, TypeScript typecheck, 1000-line size check, diff whitespace check: passed.
- Community manifest validation: all 92 checks passed.
- Targeted `capabilities host-scope consumer-assembly native-edit-roundtrip-issue939`: 5 suites / 35 assertions passed, zero skipped.
- Installed DSH 0.2.2-rc.2 isolated service smoke: passed.
- Complete final run: **237 passed, 6 failed, 7 skipped / 250 suites** (71 seconds). It is **not** an all-green release gate.
- Untouched aligned upstream baseline: **234 passed, 7 failed, 7 skipped / 248 suites** (77 seconds). The final patch introduces no newly failing suite relative to this baseline. The baseline's extra host-scope-source failure is affected by its symlinked dependency layout; do not attribute that entire count improvement to #942. The new split-tree regression separately demonstrated a failure before the fix and a pass after it.
- Shared remaining failures: permissions (includeHidden contract case expects items but receives no items with the published worker; root cause not fully investigated), linux-paths (maximum-length filename case), bench-gates (shallow checkout lacks the pinned historical baseline), pwsh-upgrade, release-scope and release-tar-modes (release fixtures/payload/environment). These remain unresolved and were not concealed or changed to pass. Baseline runtime directory is symlinked, so packaging fixture diagnostics are not identical even where failed suite names match.
- Seven skips require unavailable Windows/Niubash or TUI fixtures, or unsupported cache-preparation prerequisites. Skips are not passes.

Earlier candidates exposed startup-scheduling regressions. They were corrected, the affected consumer suite reran successfully, and the final full run above includes that correction. Do not use earlier intermediate logs as final acceptance.

Logs (local, outside Git): `/mnt/e/Models/workspace-cache/myself/tmp/dsh-ops-test-20261117/final-reviewed.log` and `baseline-aligned.log`. Downloaded archive and npm cache are in the same E-drive test root.

The fix is retained on branch `fix/942-active-tools-scope` (implementation commit `8dcb1cc`). On 2026-11-17 the user authorized creating a GitHub fork with `gh`. The authenticated account `pwhMass` owns the verified writable fork `https://github.com/pwhMass/dsh-ops`, whose parent is `T-Auto/dsh-ops`. Local remotes use `origin` for the owner fork and `upstream` for the original project. The fix branch is the push target; no issue, comment or pull request is published by this operation. Rust compilation, live Web-profile installation and LLM token savings are still unverified.

Next: review the candidate with upstream maintainers, validate with a locally built worker/full release payload, then consider installation into a disposable DSH profile before changing the daily Web profile.

## Environment and limits

- Linux x64; Node 24.15.0; locked development dependencies target DSH 0.2.2-rc.1, with an additional installed rc.2 smoke test.
- No Cargo installation is present. The Linux worker is the npm 0.5.5 published binary, extracted after verifying the complete package's registry SHA-512 integrity. It was not compiled locally.
- `native/target/release/dsh-ops-worker` is a test-only symlink to that published worker; it does not represent a local Rust build.
- Large archives, npm cache and full logs are on E drive. Small POSIX permission/locking fixtures use Linux temporary storage; running those on the Windows-mounted E filesystem produced nonrepresentative permission failures.
- No live provider/LLM A/B token benchmark, Windows validation, release packaging gate or production-profile installation has been performed.

## Reproduction

```sh
npm ci --ignore-scripts
npm run build
node test/run.mjs host-scope consumer-assembly
node test/run.mjs native-edit-roundtrip-issue939
npm run typecheck
npm run check:size
npm run validate:manifest
```

Worker-dependent tests require a built/staged worker. Without one a skip is not a pass. See the contributor guide for building the Rust worker rather than using a published artifact.
