# Local dsh-ops validation status

Updated: 2026-11-19 (archived initial 0.5.5 evaluation log to [STATUS-archive.md](STATUS-archive.md)).
Active checkout: `repos/upstream/dsh-ops` on branch `fix/942-active-tools-scope`, pushing reviewed batches only to `origin` (`pwhMass/dsh-ops`). No periodic schedule, upstream PR/comment, or daily-profile deployment is authorized.

## Current state & recent commits (2026-11-17)

- **Environment**: Reused installed Rust **1.98.1** (not in default PATH; explicitly overriding 1.97.1 CI pin). Cargo/build target/logs stay on E drive. Source-matched Linux worker built with `--release --locked` and staged via `bin/native-runtime.mjs` (earlier `permissions`/`linux-paths`/`host-scope` failures were published-worker mismatches, not source defects).
- **Atomic staging fix (`4aea75ea`, pushed)**: Fixed 210–255-byte basename write failures using fixed 114-byte ASCII staging names with shared new/legacy classifiers. Rust workspace passed **656 tests** (0 failed/ignored); rebuilt worker SHA-256 `3a761cfcff275cc3fc353c8505cc3a5afa86ba50619c95ca7c051d6db6730cd9`.
- **#939 Native literal source (`486695ed`, pushed)**: Ordinary source lines render literal/copyable; physically unsafe lines carry `j` marker + JSON string (canonical/PTC data and edit semantics unchanged). Verified `native-line-encoding`, `native-projection`, `file-sdk-render`, `bench-integrity` (**4 suites / 29 checks passed**) plus literal edit / compact range / dedup checks.
- **Release fixture override (`ccf8cf6f`, pushed)**: Updated `test/release-scope.test.mjs` to use `stageFixtureNiubash` honoring `DSH_OPS_NIUBASH_ARCHIVE` (`node --check` passed; runtime check pending a real pinned Niubash archive).
- **Local logs (outside Git)**: `/mnt/e/Models/workspace-cache/myself/tmp/dsh-ops-maintenance/{render-reviewed.log,targeted-combined.log}`.

## Remaining blockers & next steps

- **Unverified / open**: `release-scope`, `release-tar-modes`, `pwsh-upgrade` (need real pinned Niubash archive/fixtures), `bench-gates` (needs historical baseline), Windows execution, and production-profile deployment.
- **Next**: When a verified pinned Niubash archive is available, run `DSH_OPS_NIUBASH_ARCHIVE=<archive> node test/run.mjs release-scope`; check `release-tar-modes` and `pwsh-upgrade` separately if release validation is requested.

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

Worker-dependent tests require a built/staged worker (without one, skips are not passes). Initial 0.5.5 evaluation details are in [STATUS-archive.md](STATUS-archive.md).
