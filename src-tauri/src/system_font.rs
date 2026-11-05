use std::path::PathBuf;

use tauri::ipc::Response;

#[cfg(target_os = "macos")]
fn font_path(style: &str) -> Option<PathBuf> {
    let file = match style {
        "regular" => "Times New Roman.ttf",
        "bold" => "Times New Roman Bold.ttf",
        "italic" => "Times New Roman Italic.ttf",
        "bold-italic" => "Times New Roman Bold Italic.ttf",
        _ => return None,
    };
    Some(PathBuf::from("/System/Library/Fonts/Supplemental").join(file))
}

#[cfg(target_os = "windows")]
fn font_path(style: &str) -> Option<PathBuf> {
    let file = match style {
        "regular" => "times.ttf",
        "bold" => "timesbd.ttf",
        "italic" => "timesi.ttf",
        "bold-italic" => "timesbi.ttf",
        _ => return None,
    };
    let windows = std::env::var_os("WINDIR")?;
    Some(PathBuf::from(windows).join("Fonts").join(file))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn font_path(_style: &str) -> Option<PathBuf> {
    None
}

/// Times New Roman can't be bundled, but both systems include it. The fixed list means this can
/// only ever read those four files, whatever the page asks for.
#[tauri::command]
pub async fn read_system_font(style: String) -> Result<Response, ()> {
    let path = font_path(&style).ok_or(())?;
    let bytes = std::fs::read(path).map_err(|_| ())?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_anything_outside_the_list() {
        assert!(font_path("../../secrets").is_none());
        assert!(font_path("").is_none());
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    fn knows_all_four_styles() {
        for style in ["regular", "bold", "italic", "bold-italic"] {
            let path = font_path(style).unwrap();
            assert!(path.to_string_lossy().to_lowercase().contains("times"));
        }
    }
}
