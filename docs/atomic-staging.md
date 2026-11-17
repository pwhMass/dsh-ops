# Atomic staging and long filenames

[中文](atomic-staging.zh.md)

Fixed file mutations stage unpublished bytes in a private sibling of their target, then restore metadata, sync and publish through the existing atomic/no-clobber operation. Staging a legal long filename must not require an even longer filename.

The current staging basename is `.dsh-ops-tmp-<64-hex-target-key>-<v4-UUID>`: **114 ASCII bytes**, independent of the target's UTF-8 length. The target key uses the same SHA-256 of the lowercased basename as the update lock. A fresh UUID distinguishes individual staging attempts; the hash does not grant authority. This supports valid 209-, 210- and 255-byte POSIX basenames, including CJK and emoji, without truncating a UTF-8 name.

- Both overwrite/edit/replace and create-only write/copy publication use the bounded name.
- Update-lock names and their authority/lifetime remain unchanged.
- While holding the target update lock, cleanup recognises only the complete current target-key + RFC 4122 v4 UUID shape, plus the exact legacy `.<target>.dsh-ops-<v4-UUID>` shape. Other targets, invalid near-matches and operator backups are not swept.
- Search shares the publication classifier: current and legacy temporaries remain internal even with `includeHidden: true` or an explicit path. A name merely beginning with `.dsh-ops-tmp-` is still caller content unless its complete generated shape matches.
- Same-directory handle-relative creation, no-follow traversal, private initial permissions, revision/CAS checks, metadata restoration and effect reporting are unchanged. This naming fix does not add write authority or permit overwrite where create-only publication would refuse.

Windows filename limits use different units. The POSIX-byte regression suite skips there; cross-platform acceptance still requires the platform release tests.

Verification: `node test/run.mjs long-basename-mutations lock-sidecar replace-concurrency` after building the matching native worker. Rust classifier tests live in `ops-files::atomic_staging`.
