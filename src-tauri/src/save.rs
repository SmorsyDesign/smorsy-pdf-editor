use std::fs::{self, File};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_fs::FsExt;

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SaveError {
    NotAllowed,
    NoSpace,
    ReadOnly,
    InvalidRequest,
    Other { detail: String },
}

impl From<io::Error> for SaveError {
    fn from(error: io::Error) -> Self {
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
    let temp = temp_path(target).ok_or(SaveError::InvalidRequest)?;
    let result = write_and_rename(&temp, target, bytes);
    if result.is_err() {
        // Best effort: the temp file may never have been created, and the real error matters more.
        let _ = fs::remove_file(&temp);
    }
    result
}

fn write_and_rename(temp: &Path, target: &Path, bytes: &[u8]) -> Result<(), SaveError> {
    let mut file = File::create(temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temp, target)?;
    Ok(())
}

fn temp_path(target: &Path) -> Option<PathBuf> {
    let name = target.file_name()?.to_str()?;
    Some(target.with_file_name(format!(".{name}.{}.saving", std::process::id())))
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
    fn a_failed_write_keeps_the_existing_file() {
        let folder = tempfile::tempdir().unwrap();
        let missing = folder.path().join("no-such-folder").join("copy.pdf");
        assert!(write_atomic(&missing, b"new").is_err());
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 0);
    }
}
