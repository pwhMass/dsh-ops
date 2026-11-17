//! Fixed-size private sibling names shared by publication, cleanup and search.
//!
//! A full target basename cannot be embedded in a temporary: a legal 255-byte
//! target would need a 301-byte sibling. Hash the same case-folded target key as
//! the update lock, then append a fresh UUID in a separate internal namespace.
use sha2::{Digest, Sha256};

const PREFIX: &str = ".dsh-ops-tmp-";
const LEGACY_SEPARATOR: &str = ".dsh-ops-";

pub(crate) fn prefix(target: &str) -> String {
    format!(
        "{PREFIX}{:x}-",
        Sha256::digest(target.to_lowercase().as_bytes())
    )
}

pub(crate) fn new_name(target: &str) -> String {
    format!("{}{}", prefix(target), uuid::Uuid::new_v4())
}

pub(crate) fn v4_uuid(value: &str) -> bool {
    value.len() == 36
        && uuid::Uuid::parse_str(value).is_ok_and(|parsed| {
            parsed.get_version_num() == 4 && parsed.get_variant() == uuid::Variant::RFC4122
        })
}

/// Both the bounded format and the exact legacy format remain internal content.
/// Never classify a mere prefix as a temporary or slice a UTF-8 name by bytes.
pub fn is_temporary(name: &str) -> bool {
    if let Some(rest) = name.strip_prefix(PREFIX) {
        if let Some((digest, tail)) = rest.split_once('-') {
            if digest.len() == 64
                && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
                && v4_uuid(tail)
            {
                return true;
            }
        }
    }
    name.strip_prefix('.')
        .and_then(|rest| rest.rsplit_once(LEGACY_SEPARATOR))
        .is_some_and(|(target, tail)| !target.is_empty() && v4_uuid(tail))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_names_are_fixed_ascii_and_bound_to_the_lock_key() {
        for target in [
            "a".repeat(255),
            "中".repeat(85),
            format!("{}abc", "😀".repeat(63)),
        ] {
            let first = new_name(&target);
            assert_eq!(first.len(), 114);
            assert!(first.is_ascii());
            assert!(is_temporary(&first));
            assert!(first.starts_with(&prefix(&target)));
            assert_ne!(first, new_name(&target));
        }
        assert_eq!(prefix("Notes.txt"), prefix("notes.txt"));
        assert_ne!(prefix("notes.txt"), prefix("other.txt"));
    }

    #[test]
    fn classification_requires_the_entire_generated_shape() {
        const UUID: &str = "00000000-0000-4000-8000-000000000000";
        assert!(is_temporary(&format!("{}{}", prefix("notes.txt"), UUID)));
        assert!(is_temporary(&format!(".中文.txt.dsh-ops-{UUID}")));
        for name in [
            ".notes.txt.dsh-ops-personal-backup".to_owned(),
            format!(".dsh-ops-tmp-deadbeef-{UUID}"),
            format!("{}{}-backup", prefix("notes.txt"), UUID),
            format!(".notes.txt.dsh-ops-{}", UUID.replace("4000", "1000")),
            ".notes.txt.dsh-ops-aaaaaaa中aaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            format!(".dsh-ops-{UUID}"),
        ] {
            assert!(!is_temporary(&name), "{name}");
        }
    }
}
