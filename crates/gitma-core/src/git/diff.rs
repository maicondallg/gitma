use crate::domain::{
    DiffHunk, DiffLine, DiffLineKind, FileDiff, GitError, GitErrorCategory, GitResult,
};
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

pub fn parse_hunks(data: &[u8]) -> Vec<DiffHunk> {
    if data.windows(12).any(|window| window == b"Binary files")
        || data.windows(16).any(|window| window == b"GIT binary patch")
    {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(data);
    let lines: Vec<&str> = text.lines().collect();
    let mut header_lines = Vec::new();
    let mut hunks_lines: Vec<Vec<&str>> = Vec::new();
    let mut current_hunk: Option<Vec<&str>> = None;
    let mut in_hunks = false;

    for line in lines {
        if line.starts_with("@@ ") {
            in_hunks = true;
            if let Some(h) = current_hunk.take() {
                hunks_lines.push(h);
            }
            current_hunk = Some(vec![line]);
        } else if in_hunks {
            if let Some(ref mut h) = current_hunk {
                h.push(line);
            }
        } else {
            header_lines.push(line);
        }
    }
    if let Some(h) = current_hunk {
        hunks_lines.push(h);
    }

    if hunks_lines.is_empty() {
        return Vec::new();
    }

    let mut header = header_lines.join("\n");
    if !header.is_empty() {
        header.push('\n');
    }

    let mut result = Vec::new();
    for (i, h_lines) in hunks_lines.into_iter().enumerate() {
        if h_lines.is_empty() {
            continue;
        }
        let first = h_lines[0];
        let (old_start, old_lines, new_start, new_lines) =
            parse_hunk_header_ranges(first).unwrap_or((1, 1, 1, 1));
        let mut patch = format!("{}{}\n", header, h_lines.join("\n"));
        if !patch.ends_with('\n') {
            patch.push('\n');
        }
        result.push(DiffHunk {
            id: format!("hunk-{}", i),
            header: first.to_string(),
            old_start,
            old_lines,
            new_start,
            new_lines,
            patch,
        });
    }
    result
}

fn parse_hunk_header_ranges(line: &str) -> Option<(u32, u32, u32, u32)> {
    let body = line.strip_prefix("@@ ")?;
    let (ranges, _) = body.split_once(" @@")?;
    let mut parts = ranges.split_whitespace();
    let (old_start, old_lines) = parse_hunk_range(parts.next()?.strip_prefix('-')?)?;
    let (new_start, new_lines) = parse_hunk_range(parts.next()?.strip_prefix('+')?)?;
    Some((old_start, old_lines, new_start, new_lines))
}

fn parse_hunk_range(range: &str) -> Option<(u32, u32)> {
    match range.split_once(',') {
        Some((s, c)) => Some((s.parse().ok()?, c.parse().ok()?)),
        None => Some((range.parse().ok()?, 1)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hunks_multiple() {
        let diff = b"diff --git a/test.txt b/test.txt\nindex 1234..5678 100644\n--- a/test.txt\n+++ b/test.txt\n@@ -10,5 +10,6 @@ section\n line 1\n+line 2\n line 3\n@@ -50 +51,2 @@\n foo\n+bar\n";
        let hunks = parse_hunks(diff);
        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[0].id, "hunk-0");
        assert_eq!(hunks[0].old_start, 10);
        assert_eq!(hunks[0].old_lines, 5);
        assert_eq!(hunks[0].new_start, 10);
        assert_eq!(hunks[0].new_lines, 6);
        assert!(hunks[0]
            .patch
            .starts_with("diff --git a/test.txt b/test.txt\n"));
        assert!(hunks[0].patch.contains("@@ -10,5 +10,6 @@"));

        assert_eq!(hunks[1].id, "hunk-1");
        assert_eq!(hunks[1].old_start, 50);
        assert_eq!(hunks[1].old_lines, 1);
        assert_eq!(hunks[1].new_start, 51);
        assert_eq!(hunks[1].new_lines, 2);
        assert!(hunks[1].patch.contains("@@ -50 +51,2 @@"));
    }

    #[test]
    fn test_parse_hunks_binary() {
        let diff =
            b"diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n";
        let hunks = parse_hunks(diff);
        assert!(hunks.is_empty());
    }
}
