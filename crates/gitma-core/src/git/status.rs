use crate::domain::{ChangedFile, FileArea, FileStatus};
use std::path::PathBuf;

#[cfg(unix)]
pub(super) fn path_from_bytes(bytes: &[u8]) -> PathBuf {
    use std::os::unix::ffi::OsStringExt;
    PathBuf::from(std::ffi::OsString::from_vec(bytes.to_vec()))
}
#[cfg(not(unix))]
pub(super) fn path_from_bytes(bytes: &[u8]) -> PathBuf {
    PathBuf::from(String::from_utf8_lossy(bytes).into_owned())
}

#[derive(Clone, Debug, Default)]
pub struct PorcelainV2Status {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub staged: Vec<ChangedFile>,
    pub unstaged: Vec<ChangedFile>,
    pub conflicted: bool,
}

fn skip_spaces(bytes: &[u8], count: usize) -> Option<&[u8]> {
    let mut rest = bytes;
    for _ in 0..count {
        let pos = rest.iter().position(|&b| b == b' ')?;
        rest = &rest[pos + 1..];
    }
    Some(rest)
}

pub fn parse_porcelain_v2_z(data: &[u8]) -> PorcelainV2Status {
    let mut out = PorcelainV2Status::default();
    let mut fields = data.split(|b| *b == 0).filter(|x| !x.is_empty());

    let classify = |code: char, conflicted: &mut bool| match code {
        'A' => FileStatus::Added,
        'D' => FileStatus::Deleted,
        'R' => FileStatus::Renamed,
        'C' => FileStatus::Copied,
        '?' => FileStatus::Untracked,
        'U' => {
            *conflicted = true;
            FileStatus::Conflicted
        }
        _ => FileStatus::Modified,
    };

    while let Some(raw) = fields.next() {
        if let Some(header) = raw.strip_prefix(b"# ") {
            if let Some(head) = header.strip_prefix(b"branch.head ") {
                let text = String::from_utf8_lossy(head);
                let trimmed = text.trim();
                if !trimmed.is_empty() && trimmed != "(detached)" {
                    out.branch = Some(trimmed.to_owned());
                }
            } else if let Some(up) = header.strip_prefix(b"branch.upstream ") {
                let text = String::from_utf8_lossy(up);
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    out.upstream = Some(trimmed.to_owned());
                }
            } else if let Some(ab) = header.strip_prefix(b"branch.ab ") {
                let text = String::from_utf8_lossy(ab);
                for token in text.split_whitespace() {
                    if let Some(a) = token.strip_prefix('+') {
                        out.ahead = a.parse::<usize>().ok();
                    } else if let Some(b) = token.strip_prefix('-') {
                        out.behind = b.parse::<usize>().ok();
                    }
                }
            }
            continue;
        }

        if let Some(path_bytes) = raw.strip_prefix(b"? ") {
            out.unstaged.push(ChangedFile::new(
                path_from_bytes(path_bytes),
                None,
                FileStatus::Untracked,
                FileArea::Unstaged,
            ));
            continue;
        }

        if raw.len() < 5 {
            continue;
        }

        let rec_type = raw[0];
        if rec_type == b'u' && raw[1] == b' ' {
            let x = raw[2] as char;
            let y = raw[3] as char;
            let Some(path_bytes) = skip_spaces(raw, 10) else {
                continue;
            };
            let path = path_from_bytes(path_bytes);
            out.conflicted = true;
            if x != '.' && x != ' ' {
                out.staged.push(ChangedFile::new(
                    path.clone(),
                    None,
                    FileStatus::Conflicted,
                    FileArea::Staged,
                ));
            }
            if y != '.' && y != ' ' {
                out.unstaged.push(ChangedFile::new(
                    path,
                    None,
                    FileStatus::Conflicted,
                    FileArea::Unstaged,
                ));
            }
            continue;
        }

        if (rec_type == b'1' || rec_type == b'2') && raw[1] == b' ' {
            let x = raw[2] as char;
            let y = raw[3] as char;
            let spaces = if rec_type == b'2' { 9 } else { 8 };
            let Some(path_bytes) = skip_spaces(raw, spaces) else {
                continue;
            };
            let path = path_from_bytes(path_bytes);
            let old = if rec_type == b'2' {
                fields.next().map(path_from_bytes)
            } else {
                None
            };
            if x != '.' && x != ' ' {
                out.staged.push(ChangedFile::new(
                    path.clone(),
                    old.clone(),
                    classify(x, &mut out.conflicted),
                    FileArea::Staged,
                ));
            }
            if y != '.' && y != ' ' {
                out.unstaged.push(ChangedFile::new(
                    path,
                    old,
                    classify(y, &mut out.conflicted),
                    FileArea::Unstaged,
                ));
            }
        }
    }

    out
}

pub fn parse_porcelain_z(data: &[u8]) -> (Vec<ChangedFile>, Vec<ChangedFile>, bool) {
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut conflicted = false;
    let mut fields = data.split(|b| *b == 0).filter(|x| !x.is_empty());
    while let Some(raw) = fields.next() {
        if raw.len() < 3 {
            continue;
        }
        let x = raw[0] as char;
        let y = raw[1] as char;
        let path = path_from_bytes(&raw[3..]);
        let mut old = None;
        if x == 'R' || y == 'R' || x == 'C' || y == 'C' {
            // Porcelain -z emits the destination first and the source second.
            if let Some(next) = fields.next() {
                old = Some(path_from_bytes(next));
            }
        }
        let unmerged = matches!(
            (x, y),
            ('D', 'D')
                | ('A', 'U')
                | ('U', 'D')
                | ('U', 'A')
                | ('D', 'U')
                | ('A', 'A')
                | ('U', 'U')
        );
        let classify = |code: char, conflicted: &mut bool| match code {
            'A' => FileStatus::Added,
            'D' => FileStatus::Deleted,
            'R' => FileStatus::Renamed,
            'C' => FileStatus::Copied,
            '?' => FileStatus::Untracked,
            'U' => {
                *conflicted = true;
                FileStatus::Conflicted
            }
            _ => FileStatus::Modified,
        };
        if x == '?' {
            unstaged.push(ChangedFile::new(
                path,
                old,
                classify('?', &mut conflicted),
                FileArea::Unstaged,
            ));
            continue;
        }
        if unmerged {
            conflicted = true;
            if x != ' ' {
                staged.push(ChangedFile::new(
                    path.clone(),
                    old.clone(),
                    FileStatus::Conflicted,
                    FileArea::Staged,
                ));
            }
            if y != ' ' {
                unstaged.push(ChangedFile::new(
                    path,
                    old,
                    FileStatus::Conflicted,
                    FileArea::Unstaged,
                ));
            }
            continue;
        }
        if x != ' ' {
            staged.push(ChangedFile::new(
                path.clone(),
                old.clone(),
                classify(x, &mut conflicted),
                FileArea::Staged,
            ));
        }
        if y != ' ' {
            unstaged.push(ChangedFile::new(
                path,
                old,
                classify(y, &mut conflicted),
                FileArea::Unstaged,
            ));
        }
    }
    (staged, unstaged, conflicted)
}

pub fn parse_commit_names(data: &[u8]) -> Vec<ChangedFile> {
    let fields: Vec<&[u8]> = data.split(|b| *b == 0).filter(|x| !x.is_empty()).collect();
    let mut result = Vec::new();
    let mut i = 0;
    while i < fields.len() {
        let code = String::from_utf8_lossy(fields[i]);
        let kind = code.chars().next().unwrap_or('M');
        let first = fields
            .get(i + 1)
            .map(|x| path_from_bytes(x))
            .unwrap_or_default();
        let (status, path, old_path, consumed) = match kind {
            'A' => (FileStatus::Added, first, None, 2),
            'D' => (FileStatus::Deleted, first, None, 2),
            'R' => {
                let next = fields
                    .get(i + 2)
                    .map(|x| path_from_bytes(x))
                    .unwrap_or_default();
                (FileStatus::Renamed, next, Some(first), 3)
            }
            'C' => {
                let next = fields
                    .get(i + 2)
                    .map(|x| path_from_bytes(x))
                    .unwrap_or_default();
                (FileStatus::Copied, next, Some(first), 3)
            }
            _ => (FileStatus::Modified, first, None, 2),
        };
        result.push(ChangedFile::new(path, old_path, status, FileArea::Commit));
        i += consumed;
    }
    result
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FileNumstat {
    pub insertions: Option<usize>,
    pub deletions: Option<usize>,
    pub is_binary: bool,
}

pub fn parse_numstat_z(data: &[u8]) -> std::collections::HashMap<PathBuf, FileNumstat> {
    let mut stats = std::collections::HashMap::new();
    let fields: Vec<&[u8]> = data.split(|b| *b == 0).filter(|x| !x.is_empty()).collect();
    let mut i = 0;
    while i < fields.len() {
        let entry = String::from_utf8_lossy(fields[i]);
        let parts: Vec<&str> = entry.split('\t').collect();
        if parts.len() >= 3 {
            let ins_str = parts[0];
            let del_str = parts[1];
            let path_part = parts[2];
            let is_binary = ins_str == "-" || del_str == "-";
            let insertions = if is_binary {
                None
            } else {
                ins_str.parse().ok()
            };
            let deletions = if is_binary {
                None
            } else {
                del_str.parse().ok()
            };
            let stat = FileNumstat {
                insertions,
                deletions,
                is_binary,
            };

            if !path_part.is_empty() {
                stats.insert(path_from_bytes(path_part.as_bytes()), stat);
                i += 1;
            } else {
                // Rename or copy in -z mode:
                // next field is old_path, following is new_path
                let old_p = fields.get(i + 1).map(|x| path_from_bytes(x));
                let new_p = fields.get(i + 2).map(|x| path_from_bytes(x));
                if let Some(np) = new_p {
                    stats.insert(np, stat.clone());
                }
                if let Some(op) = old_p {
                    stats.insert(op, stat);
                }
                i += 3;
            }
        } else {
            i += 1;
        }
    }
    stats
}

/// Parses combined `git diff-tree --raw --numstat -z` output in a single pass,
/// avoiding spawning two separate `diff-tree` subprocesses per commit.
pub fn parse_diff_tree_raw_numstat_z(data: &[u8]) -> Vec<ChangedFile> {
    let fields: Vec<&[u8]> = data.split(|b| *b == 0).filter(|x| !x.is_empty()).collect();
    let mut files = Vec::new();
    let mut i = 0;

    // 1. Parse `--raw -z` records, each starting with `:mode_src mode_dst sha_src sha_dst STATUS`
    while i < fields.len() && fields[i].first() == Some(&b':') {
        let meta = fields[i];
        let status_code = meta
            .rsplit(|&b| b == b' ')
            .next()
            .and_then(|s| s.first().copied())
            .unwrap_or(b'M') as char;
        let first = fields
            .get(i + 1)
            .map(|x| path_from_bytes(x))
            .unwrap_or_default();
        let (status, path, old_path, consumed) = match status_code {
            'A' => (FileStatus::Added, first, None, 2),
            'D' => (FileStatus::Deleted, first, None, 2),
            'R' => {
                let next = fields
                    .get(i + 2)
                    .map(|x| path_from_bytes(x))
                    .unwrap_or_default();
                (FileStatus::Renamed, next, Some(first), 3)
            }
            'C' => {
                let next = fields
                    .get(i + 2)
                    .map(|x| path_from_bytes(x))
                    .unwrap_or_default();
                (FileStatus::Copied, next, Some(first), 3)
            }
            _ => (FileStatus::Modified, first, None, 2),
        };
        files.push(ChangedFile::new(path, old_path, status, FileArea::Commit));
        i += consumed;
    }

    // 2. Parse trailing `--numstat -z` records from `fields[i..]`
    let mut stats = std::collections::HashMap::with_capacity(files.len());
    while i < fields.len() {
        let entry = String::from_utf8_lossy(fields[i]);
        let parts: Vec<&str> = entry.split('\t').collect();
        if parts.len() >= 3 {
            let ins_str = parts[0];
            let del_str = parts[1];
            let path_part = parts[2];
            let is_binary = ins_str == "-" || del_str == "-";
            let insertions = if is_binary {
                None
            } else {
                ins_str.parse().ok()
            };
            let deletions = if is_binary {
                None
            } else {
                del_str.parse().ok()
            };
            let stat = FileNumstat {
                insertions,
                deletions,
                is_binary,
            };
            if !path_part.is_empty() {
                stats.insert(path_from_bytes(path_part.as_bytes()), stat);
                i += 1;
            } else {
                let old_p = fields.get(i + 1).map(|x| path_from_bytes(x));
                let new_p = fields.get(i + 2).map(|x| path_from_bytes(x));
                if let Some(np) = new_p {
                    stats.insert(np, stat.clone());
                }
                if let Some(op) = old_p {
                    stats.insert(op, stat);
                }
                i += 3;
            }
        } else {
            i += 1;
        }
    }

    for f in &mut files {
        if let Some(stat) = stats
            .get(&f.path)
            .or_else(|| f.old_path.as_ref().and_then(|op| stats.get(op)))
        {
            f.insertions = stat.insertions;
            f.deletions = stat.deletions;
            f.is_binary = stat.is_binary;
        }
    }

    files
}
