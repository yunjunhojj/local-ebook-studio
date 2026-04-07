use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiCompletionInput {
    provider: String,
    api_key: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
    book_title: String,
    chapter_title: String,
    language: String,
    before_cursor: String,
    after_cursor: String,
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
    let root = Path::new(&input.parent_dir).join(&slug);
    if input.language != "en" && input.language != "ko" {
        return Err("Language must be either en or ko.".to_string());
    }

    if root.join("book.json").exists() {
        return Err("A book project already exists at that location.".to_string());
    }

    fs::create_dir_all(root.join("chapters")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("assets/images")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("assets/diagrams")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("themes")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("exports")).map_err(|error| error.to_string())?;

    let chapter_path = if input.language == "ko" {
        "chapters/01-introduction.md"
    } else {
        "chapters/01-introduction.md"
    };
    let chapter_title = if input.language == "ko" {
        "들어가며"
    } else {
        "Introduction"
    };
    let chapter = json!({
        "id": "chapter-1",
        "title": chapter_title,
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
        "language": input.language.clone(),
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

    let chapter_md = if input.language == "ko" {
        format!(
            "# 들어가며\n\n**{}** 원고 작성을 시작하세요.\n\n```ts filename=\"browser.ts\" highlight=\"2\"\nexport function parseHTML(input: string) {{\n  return input.trim();\n}}\n```\n",
            book["title"].as_str().unwrap_or("전자책")
        )
    } else {
        format!(
            "# Introduction\n\nStart writing **{}** here.\n\n```ts filename=\"browser.ts\" highlight=\"2\"\nexport function parseHTML(input: string) {{\n  return input.trim();\n}}\n```\n",
            book["title"].as_str().unwrap_or("your ebook")
        )
    };
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
fn read_binary(root_path: String, relative_path: String) -> Result<Vec<u8>, String> {
    let path = safe_join(&root_path, &relative_path)?;
    fs::read(path).map_err(|error| error.to_string())
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

#[tauri::command]
async fn ai_complete(input: AiCompletionInput) -> Result<String, String> {
    if input.api_key.trim().is_empty() {
        return Err("AI API key is required.".to_string());
    }
    if input.model.trim().is_empty() {
        return Err("AI model is required.".to_string());
    }

    let prompt = build_ai_prompt(&input);
    let client = reqwest::Client::new();
    let result = match input.provider.as_str() {
        "openai" => complete_openai(&client, &input, &prompt).await,
        "anthropic" => complete_anthropic(&client, &input, &prompt).await,
        "gemini" => complete_gemini(&client, &input, &prompt).await,
        _ => Err("Unsupported AI provider.".to_string()),
    }?;

    let completion = clean_completion(&result);
    if completion.is_empty() {
        Err("AI returned an empty suggestion. Add more text near the cursor or adjust the completion prompt.".to_string())
    } else {
        Ok(completion)
    }
}

fn build_ai_prompt(input: &AiCompletionInput) -> String {
    format!(
        "{}\n\nBook title: {}\nChapter title: {}\nLanguage: {}\n\nUser instruction:\n{}\n\nText before cursor:\n{}\n\nText after cursor:\n{}\n\nReturn only the text to insert at the cursor. Do not wrap it in quotes or Markdown fences.",
        input.system_prompt,
        input.book_title,
        input.chapter_title,
        input.language,
        input.user_prompt,
        input.before_cursor,
        input.after_cursor
    )
}

async fn complete_openai(
    client: &reqwest::Client,
    input: &AiCompletionInput,
    prompt: &str,
) -> Result<String, String> {
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(input.api_key.trim())
        .json(&json!({
            "model": input.model,
            "instructions": input.system_prompt,
            "input": prompt,
            "max_output_tokens": 96
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    parse_ai_response(response, |body| {
        if let Some(output_text) = body.get("output_text").and_then(Value::as_str) {
            return Some(output_text.to_string());
        }

        body.get("output")
            .and_then(Value::as_array)?
            .iter()
            .flat_map(|item| {
                item.get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .find_map(|content| {
                content
                    .get("text")
                    .or_else(|| content.get("output_text"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
    .await
}

async fn complete_anthropic(
    client: &reqwest::Client,
    input: &AiCompletionInput,
    prompt: &str,
) -> Result<String, String> {
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", input.api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": input.model,
            "max_tokens": 96,
            "system": input.system_prompt,
            "messages": [{ "role": "user", "content": prompt }]
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    parse_ai_response(response, |body| {
        body.get("content")
            .and_then(Value::as_array)?
            .iter()
            .find_map(|content| {
                content
                    .get("text")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
    .await
}

async fn complete_gemini(
    client: &reqwest::Client,
    input: &AiCompletionInput,
    prompt: &str,
) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        input.model.trim(),
        input.api_key.trim()
    );
    let response = client
        .post(url)
        .json(&json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "systemInstruction": { "parts": [{ "text": input.system_prompt }] },
            "generationConfig": {
                "maxOutputTokens": 96,
                "temperature": 0.2
            }
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    parse_ai_response(response, |body| {
        body.get("candidates")
            .and_then(Value::as_array)?
            .first()?
            .get("content")?
            .get("parts")
            .and_then(Value::as_array)?
            .iter()
            .find_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    })
    .await
}

async fn parse_ai_response<F>(response: reqwest::Response, extract: F) -> Result<String, String>
where
    F: Fn(&Value) -> Option<String>,
{
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        let message = body
            .pointer("/error/message")
            .or_else(|| body.pointer("/error/error/message"))
            .and_then(Value::as_str)
            .unwrap_or("AI request failed.");
        return Err(message.to_string());
    }

    extract(&body).ok_or_else(|| "AI response did not include completion text.".to_string())
}

fn clean_completion(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
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
            read_binary,
            write_text,
            delete_file,
            write_asset,
            list_assets,
            write_export_text,
            write_export_binary,
            ai_complete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
