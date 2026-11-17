//! Which path components a search may observe.
//!
//! Two rules live here, and they are deliberately separate. [`dotdir`] marks
//! caller content that an opt-in flag may lift; [`internal`] marks the plugin's
//! own bookkeeping, which no request shape may reach. [`reserved`] covers the
//! dependency and build trees that are always pruned.
use ops_protocol::{Failure, Result};
use std::path::Path;

/// An ordinary dot-prefixed path component (`.github`, `.config`, `.env`).
///
/// This is user content that a caller may ask to traverse. It is kept separate
/// from [`internal`] so that opting in cannot reach the plugin's own sidecars.
pub(crate) fn dotdir(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root)
        .ok()
        .into_iter()
        .flat_map(|p| p.components())
        .any(|c| {
            let name = c.as_os_str().to_string_lossy();
            name.starts_with('.') && !internal(&name)
        })
}

/// The plugin's own bookkeeping, which no selection tool may observe.
///
/// `ops_glob`, `ops_grep` and a directory-wide `ops_replace` must never return,
/// count or rewrite these: the update lock in particular is what keeps two
/// concurrent writes from interleaving, and the atomic-write temporary carries
/// the not-yet-durable bytes of a file that is being replaced. There is
/// deliberately no flag that lifts this predicate.
///
/// This matches whole shapes, never a prefix. `ops-files` already paid for that
/// lesson once: `sweep_debris` used to delete anything beginning the same way and
/// took an operator's `.notes.txt.dsh-ops-personal-backup` with it (review of
/// #81). A directory named `.dsh-ops-backup` or a file named `.dsh-ops.json` is
/// the caller's content, and `test/audit-store-paths.test.mjs` writes exactly
/// those and expects them to remain readable.
pub(crate) fn internal(name: &str) -> bool {
    name.eq_ignore_ascii_case(".dsh-ops") || update_lock(name) || atomic_temporary(name)
}

/// `.dsh-ops-update-<sha256 hex>.lock`, the name `lock_for_update` acquires.
///
/// The digest is `Sha256` of the lowercased target name formatted `{:x}`, so the
/// tail is exactly 64 lowercase hex digits. Checking the shape keeps a file such
/// as `.dsh-ops-update-notes.lock` — which no writer ever creates — in the
/// caller's hands.
fn update_lock(name: &str) -> bool {
    let Some(rest) = name.strip_prefix(".dsh-ops-update-") else {
        return false;
    };
    let Some(digest) = rest.strip_suffix(".lock") else {
        return false;
    };
    digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Both fixed-size hashed siblings and exact legacy siblings carry unpublished
/// content. Share publication's complete-shape matcher so `includeHidden` can
/// never expose them and near-miss operator backups remain caller content.
fn atomic_temporary(name: &str) -> bool {
    ops_files::atomic_staging::is_temporary(name)
}

/// Every exclusion the walk applies that is not a caller-selectable dot path.
pub(crate) fn reserved(name: &str) -> bool {
    matches!(name, "node_modules" | "target" | ".venv" | ".git")
}

/// Rejects a caller-supplied root that is, or sits inside, this plugin's own
/// bookkeeping.
///
/// The walk drops these while enumerating, but an explicit `path` never reaches
/// the enumerator when it names a file: `Scan::walk` hands a file root straight
/// to `each`, and `files_for` returns it as the only match. Enumerating and
/// naming the same path therefore disagree, and the narrower contract is the
/// honest one to keep. `ops-files` already refuses the exact `.dsh-ops` store
/// component; this also refuses the update lock, which is the one internal name
/// that is not the store itself. It is deliberately not a flag: the lock is not
/// caller-selectable content, so no request shape may observe it.
pub(crate) fn reject_internal_root(root: &Path) -> Result<()> {
    let offender = root.components().find_map(|component| {
        let name = component.as_os_str().to_string_lossy();
        internal(&name).then(|| name.into_owned())
    });
    match offender {
        Some(name) => Err(Failure::new(
            "PATH_RESTRICTED",
            format!("{name} is reserved for internal operations"),
        )),
        None => Ok(()),
    }
}
