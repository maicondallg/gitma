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
            unstaged.push(ChangedFile {
                path,
                old_path: old,
                status: classify('?', &mut conflicted),
                area: FileArea::Unstaged,
            });
            continue;
        }
        if unmerged {
            conflicted = true;
            if x != ' ' {
                staged.push(ChangedFile {
                    path: path.clone(),
                    old_path: old.clone(),
                    status: FileStatus::Conflicted,
                    area: FileArea::Staged,
                });
            }
            if y != ' ' {
                unstaged.push(ChangedFile {
                    path,
                    old_path: old,
                    status: FileStatus::Conflicted,
                    area: FileArea::Unstaged,
                });
            }
            continue;
        }
        if x != ' ' {
            staged.push(ChangedFile {
                path: path.clone(),
                old_path: old.clone(),
                status: classify(x, &mut conflicted),
                area: FileArea::Staged,
            });
        }
        if y != ' ' {
            unstaged.push(ChangedFile {
                path,
                old_path: old,
                status: classify(y, &mut conflicted),
                area: FileArea::Unstaged,
            });
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
        result.push(ChangedFile {
            path,
            old_path,
            status,
            area: FileArea::Commit,
        });
        i += consumed;
    }
    result
}
