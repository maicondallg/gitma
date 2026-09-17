use crate::domain::{DiffLine, DiffLineKind, FileDiff, GitError, GitErrorCategory, GitResult};
use std::io::Read;
use std::path::Path;

pub const DEFAULT_MAX_BYTES: usize = 2 * 1024 * 1024;
const DEFAULT_MAX_LINES: usize = 20_000;

pub fn untracked(path: &Path, max_bytes: usize) -> GitResult<FileDiff> {
    // Read at most one byte beyond the display budget.  This keeps an
    // untracked multi-gigabyte file from being loaded merely to show a preview.
    let mut file = std::fs::File::open(path).map_err(|error| GitError {
        category: GitErrorCategory::Io,
        message: "Não foi possível ler o arquivo".into(),
        details: Some(error.to_string()),
    })?;
    let mut bytes = Vec::with_capacity(max_bytes.saturating_add(1));
    file.by_ref()
        .take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| GitError {
            category: GitErrorCategory::Io,
            message: "Não foi possível ler o arquivo".into(),
            details: Some(error.to_string()),
        })?;
    if bytes.contains(&0) {
        return Ok(FileDiff::Binary);
    }
    let mut truncated = bytes.len() > max_bytes;
    bytes.truncate(max_bytes);
    let content = String::from_utf8_lossy(&bytes);
    let mut lines = Vec::new();
    for (index, line) in content.lines().enumerate() {
        if index == DEFAULT_MAX_LINES {
            truncated = true;
            break;
        }
        lines.push(DiffLine {
            kind: DiffLineKind::Addition,
            old_line: None,
            new_line: Some(index as u32 + 1),
            text: line.into(),
        });
    }
    Ok(FileDiff::Text { lines, truncated })
}
pub fn parse(data: &[u8], max_bytes: usize) -> GitResult<FileDiff> {
    if data.windows(12).any(|window| window == b"Binary files")
        || data.windows(16).any(|window| window == b"GIT binary patch")
    {
        return Ok(FileDiff::Binary);
    }
    let truncated = data.len() > max_bytes;
    let text = String::from_utf8_lossy(&data[..data.len().min(max_bytes)]);
    let mut old = 0u32;
    let mut new = 0u32;
    let mut lines = Vec::new();
    let mut in_hunk = false;
    for line in text.lines() {
        if line.starts_with("@@") {
            let Some((old_start, new_start)) = hunk_starts(line) else {
                continue;
            };
            old = old_start;
            new = new_start;
            in_hunk = true;
            lines.push(DiffLine {
                kind: DiffLineKind::Header,
                old_line: None,
                new_line: None,
                text: line.into(),
            });
            continue;
        }
        if !in_hunk {
            continue;
        }
        if line.starts_with("\\ No newline at end of file") {
            lines.push(DiffLine {
                kind: DiffLineKind::Header,
                old_line: None,
                new_line: None,
                text: line.into(),
            });
            continue;
        }
        let (kind, o, n, content) = if let Some(content) = line.strip_prefix('+') {
            let n = new;
            new += 1;
            (DiffLineKind::Addition, None, Some(n), content)
        } else if let Some(content) = line.strip_prefix('-') {
            let o = old;
            old += 1;
            (DiffLineKind::Removal, Some(o), None, content)
        } else {
            let o = old;
            let n = new;
            old += 1;
            new += 1;
            (
                DiffLineKind::Context,
                Some(o),
                Some(n),
                line.strip_prefix(' ').unwrap_or(line),
            )
        };
        lines.push(DiffLine {
            kind,
            old_line: o,
            new_line: n,
            text: content.into(),
        });
    }
    Ok(FileDiff::Text { lines, truncated })
}

fn hunk_starts(line: &str) -> Option<(u32, u32)> {
    let body = line.strip_prefix("@@ ")?;
    let (ranges, _) = body.split_once(" @@")?;
    let mut ranges = ranges.split_whitespace();
    let old = parse_range(ranges.next()?.strip_prefix('-')?)?;
    let new = parse_range(ranges.next()?.strip_prefix('+')?)?;
    Some((old, new))
}

fn parse_range(range: &str) -> Option<u32> {
    range
        .split_once(',')
        .map_or_else(|| range.parse().ok(), |(start, _)| start.parse().ok())
}
