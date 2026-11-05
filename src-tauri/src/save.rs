use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_fs::FsExt;

// Windows reports a file locked by another app with this code, which Rust has no named kind for.
const WINDOWS_SHARING_VIOLATION: i32 = 32;

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SaveError {
    NotAllowed,
    NoSpace,
    ReadOnly,
    InUse,
    InvalidRequest,
    Other { detail: String },
}

impl From<io::Error> for SaveError {
    fn from(error: io::Error) -> Self {
        if cfg!(windows) && error.raw_os_error() == Some(WINDOWS_SHARING_VIOLATION) {
            return SaveError::InUse;
        }
        match error.kind() {
            ErrorKind::StorageFull => SaveError::NoSpace,
            ErrorKind::PermissionDenied | ErrorKind::ReadOnlyFilesystem => SaveError::ReadOnly,
            _ => SaveError::Other {
                detail: error.to_string(),
            },
        }
    }
}

/// Writes through a temporary file beside the target, so a failed save can never leave a
/// half-written PDF or damage a file that's already there.
pub fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), SaveError> {
    // Follow links, so saving through one updates the real file and leaves the link in place.
    let target = match fs::canonicalize(target) {
        Ok(real) => real,
        Err(error) if error.kind() == ErrorKind::NotFound => target.to_path_buf(),
        Err(error) => return Err(error.into()),
    };

    // A rename would quietly replace a file marked read-only, so respect the mark here.
    let existing = match fs::metadata(&target) {
        Ok(metadata) if metadata.permissions().readonly() => return Err(SaveError::ReadOnly),
        Ok(metadata) => Some(metadata),
        Err(_) => None,
    };

    let folder = target.parent().ok_or(SaveError::InvalidRequest)?;
    let mut temp = tempfile::Builder::new()
        .prefix(".smorsy-saving-")
        // A random name that must not already exist, so nothing planted in a shared folder, such
        // as a link to another file, can redirect this write. It's removed if the save fails.
        .make_in(folder, |path| {
            OpenOptions::new().write(true).create_new(true).open(path)
        })?;
    if let Some(metadata) = &existing {
        // Set before any content goes in, so a private file's content is never less protected.
        temp.as_file().set_permissions(metadata.permissions())?;
    }
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(&target).map_err(|failure| failure.error)?;
    Ok(())
}

/// The bytes arrive as a raw request body because JSON would make large PDFs slow and huge. The
/// path must already be in the file scope, which only the native dialogs add to.
#[tauri::command]
pub async fn write_file_atomic(
    app: tauri::AppHandle,
    request: Request<'_>,
) -> Result<(), SaveError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(SaveError::InvalidRequest);
    };
    let encoded = request
        .headers()
        .get("x-path")
        .and_then(|value| value.to_str().ok())
        .ok_or(SaveError::InvalidRequest)?;
    let decoded = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| SaveError::InvalidRequest)?;
    let target = PathBuf::from(decoded.as_ref());

    if !app.fs_scope().is_allowed(&target) {
        return Err(SaveError::NotAllowed);
    }
    write_atomic(&target, bytes)
}

/// Compares what's on disk, because paths can differ and still be one file: macOS and Windows
/// ignore case by default, and links add more names. If it can't tell, it says they match, so
/// the person gets asked rather than losing a file.
pub fn refers_to_same_file(first: &Path, second: &Path) -> bool {
    match same_file::is_same_file(first, second) {
        Ok(same) => same,
        Err(error) => error.kind() != ErrorKind::NotFound,
    }
}

#[tauri::command]
pub fn is_same_file(app: tauri::AppHandle, first: PathBuf, second: PathBuf) -> bool {
    let scope = app.fs_scope();
    if !scope.is_allowed(&first) || !scope.is_allowed(&second) {
        return true;
    }
    refers_to_same_file(&first, &second)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_new_file() {
        let folder = tempfile::tempdir().unwrap();
        let target = folder.path().join("Name-edited.pdf");
        write_atomic(&target, b"%PDF-new").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"%PDF-new");
    }

    #[test]
    fn replaces_an_existing_file_and_leaves_no_temp_file() {
        let folder = tempfile::tempdir().unwrap();
        let target = folder.path().join("Résumé final (2).pdf");
        fs::write(&target, b"old").unwrap();
        write_atomic(&target, b"new").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_missing_folder_fails_and_leaves_nothing_behind() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("no-such-folder").join("copy.pdf");
        assert!(write_atomic(&missing, b"new").is_err());
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 0);
    }

    #[test]
    fn a_failed_rename_cleans_up_and_keeps_what_was_there() {
        let folder = tempfile::tempdir().unwrap();
        let blocked = folder.path().join("blocked.pdf");
        fs::create_dir(&blocked).unwrap();
        fs::write(blocked.join("kept.txt"), b"kept").unwrap();
        assert!(write_atomic(&blocked, b"new").is_err());
        assert_eq!(fs::read(blocked.join("kept.txt")).unwrap(), b"kept");
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_read_only_file_is_refused_and_unchanged() {
        let folder = tempfile::tempdir().unwrap();
        let target = folder.path().join("locked.pdf");
        fs::write(&target, b"old").unwrap();
        let mut permissions = fs::metadata(&target).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&target, permissions.clone()).unwrap();

        assert_eq!(write_atomic(&target, b"new"), Err(SaveError::ReadOnly));
        assert_eq!(fs::read(&target).unwrap(), b"old");

        // tempfile can't remove a read-only file on Windows.
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(&target, permissions).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn keeps_a_replaced_files_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let folder = tempfile::tempdir().unwrap();
        let target = folder.path().join("private.pdf");
        fs::write(&target, b"old").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
        write_atomic(&target, b"new").unwrap();
        let mode = fs::metadata(&target).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn saving_through_a_link_updates_the_real_file_and_keeps_the_link() {
        let folder = tempfile::tempdir().unwrap();
        let real = folder.path().join("real.pdf");
        let link = folder.path().join("link.pdf");
        fs::write(&real, b"old").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        write_atomic(&link, b"new").unwrap();
        assert_eq!(fs::read(&real).unwrap(), b"new");
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn new_files_get_normal_permissions_rather_than_the_temp_files() {
        use std::os::unix::fs::PermissionsExt;
        let folder = tempfile::tempdir().unwrap();
        let normal = folder.path().join("normal.txt");
        fs::write(&normal, b"x").unwrap();
        let target = folder.path().join("saved.pdf");
        write_atomic(&target, b"new").unwrap();
        let mode_of = |path: &Path| fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode_of(&target), mode_of(&normal));
    }

    #[test]
    fn recognises_one_file_under_two_names() {
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("Lease.pdf");
        fs::write(&file, b"x").unwrap();
        let dotted = folder.path().join(".").join("Lease.pdf");
        assert!(refers_to_same_file(&file, &dotted));
    }

    #[test]
    fn a_new_path_is_not_the_same_file() {
        let folder = tempfile::tempdir().unwrap();
        let file = folder.path().join("Lease.pdf");
        fs::write(&file, b"x").unwrap();
        assert!(!refers_to_same_file(&file, &folder.path().join("New.pdf")));
    }

    #[test]
    fn two_different_files_are_not_the_same() {
        let folder = tempfile::tempdir().unwrap();
        let first = folder.path().join("a.pdf");
        let second = folder.path().join("b.pdf");
        fs::write(&first, b"x").unwrap();
        fs::write(&second, b"x").unwrap();
        assert!(!refers_to_same_file(&first, &second));
    }

    #[test]
    fn serialises_the_kinds_the_interface_understands() {
        let kinds = [
            (SaveError::NotAllowed, "not-allowed"),
            (SaveError::NoSpace, "no-space"),
            (SaveError::ReadOnly, "read-only"),
            (SaveError::InUse, "in-use"),
            (SaveError::InvalidRequest, "invalid-request"),
            (
                SaveError::Other {
                    detail: String::new(),
                },
                "other",
            ),
        ];
        for (error, kind) in kinds {
            assert_eq!(serde_json::to_value(&error).unwrap()["kind"], kind);
        }
    }

    #[test]
    fn explains_common_disk_problems() {
        let full = io::Error::from(ErrorKind::StorageFull);
        assert_eq!(SaveError::from(full), SaveError::NoSpace);
        let denied = io::Error::from(ErrorKind::PermissionDenied);
        assert_eq!(SaveError::from(denied), SaveError::ReadOnly);
    }
}
