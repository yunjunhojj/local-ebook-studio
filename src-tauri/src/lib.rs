use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct NewProjectInput {
    title: String,
    author: String,
    language: String,
    description: String,
    parent_dir: String,
}

#[derive(Debug, Serialize)]
struct ProjectData {
    root_path: String,
    book: Value,
}

#[derive(Debug, Serialize)]
struct AssetEntry {
    name: String,
    path: String,
    size: u64,
}

fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for ch in input.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "ebook-project".to_string()
    } else {
        trimmed
    }
}

fn safe_join(root: &str, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() || relative_path.contains("..") {
        return Err("Relative path is outside the project.".to_string());
    }

    Ok(Path::new(root).join(relative))
}

fn read_book(root_path: &str) -> Result<Value, String> {
    let book_path = Path::new(root_path).join("book.json");
    let contents = fs::read_to_string(book_path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_project(input: NewProjectInput) -> Result<ProjectData, String> {
    let slug = slugify(&input.title);
    let root = Path::new(&input.parent_dir).join(slug);

    if root.join("book.json").exists() {
        return Err("A book project already exists at that location.".to_string());
    }

    fs::create_dir_all(root.join("chapters")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("assets/images")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("assets/diagrams")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("themes")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("exports")).map_err(|error| error.to_string())?;

    let chapter_path = "chapters/01-introduction.md";
    let chapter = json!({
        "id": "chapter-1",
        "title": "Introduction",
        "path": chapter_path,
        "order": 1,
        "status": "draft",
        "wordCount": 0,
        "updatedAt": ""
    });

    let book = json!({
        "id": slug,
        "title": input.title,
        "subtitle": "",
        "author": input.author,
        "language": input.language,
        "description": input.description,
        "coverImage": "",
        "chapters": [chapter],
        "theme": {
            "fontFamily": "system-ui",
            "codeTheme": "github-dark",
            "pageWidth": 720,
            "lineHeight": 1.65,
            "headingStyle": "numbered"
        },
        "exportConfig": {
            "formats": ["markdown", "html", "epub", "pdf"],
            "includeToc": true,
            "includeCover": false,
            "outputDir": "exports"
        }
    });

    let chapter_md = format!(
        "# Introduction\n\nStart writing **{}** here.\n\n```ts filename=\"browser.ts\" highlight=\"2\"\nexport function parseHTML(input: string) {{\n  return input.trim();\n}}\n```\n",
        book["title"].as_str().unwrap_or("your ebook")
    );
    fs::write(root.join(chapter_path), chapter_md).map_err(|error| error.to_string())?;
    fs::write(root.join("themes/default.css"), default_theme())
        .map_err(|error| error.to_string())?;
    fs::write(
        root.join("book.json"),
        serde_json::to_string_pretty(&book).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    Ok(ProjectData {
        root_path: root.to_string_lossy().to_string(),
        book,
    })
}

#[tauri::command]
fn open_project(project_path: String) -> Result<ProjectData, String> {
    let book = read_book(&project_path)?;
    Ok(ProjectData {
        root_path: project_path,
        book,
    })
}

#[tauri::command]
fn save_book(root_path: String, book: Value) -> Result<(), String> {
    let path = Path::new(&root_path).join("book.json");
    let contents = serde_json::to_string_pretty(&book).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_text(root_path: String, relative_path: String) -> Result<String, String> {
    let path = safe_join(&root_path, &relative_path)?;
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text(root_path: String, relative_path: String, content: String) -> Result<(), String> {
    let path = safe_join(&root_path, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_file(root_path: String, relative_path: String) -> Result<(), String> {
    let path = safe_join(&root_path, &relative_path)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn write_asset(root_path: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let clean_name = Path::new(&file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .replace(' ', "-");
    let relative_path = format!("assets/images/{}", clean_name);
    let path = safe_join(&root_path, &relative_path)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())?;
    Ok(relative_path)
}

#[tauri::command]
fn list_assets(root_path: String) -> Result<Vec<AssetEntry>, String> {
    let image_dir = Path::new(&root_path).join("assets/images");
    let mut entries = Vec::new();

    if !image_dir.exists() {
        return Ok(entries);
    }

    for entry in fs::read_dir(image_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if metadata.is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            entries.push(AssetEntry {
                path: format!("assets/images/{}", name),
                name,
                size: metadata.len(),
            });
        }
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn write_export_text(
    root_path: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    let relative_path = format!("exports/{}", file_name);
    let path = safe_join(&root_path, &relative_path)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn write_export_binary(
    root_path: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let relative_path = format!("exports/{}", file_name);
    let path = safe_join(&root_path, &relative_path)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|error| error.to_string())?;
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn default_theme() -> &'static str {
    "body { font-family: system-ui, sans-serif; line-height: 1.65; color: #1b1f24; }\npre { padding: 16px; overflow: auto; background: #111827; color: #f9fafb; }\ncode { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }\nimg { max-width: 100%; }\n"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            save_book,
            read_text,
            write_text,
            delete_file,
            write_asset,
            list_assets,
            write_export_text,
            write_export_binary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
