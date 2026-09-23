/**
 * Parses Git remote URLs (HTTPS, SSH, etc.) and converts them to web browser URLs
 * for GitHub, GitLab, Bitbucket, Azure DevOps, and generic Git forges.
 */

export interface WebUrlOptions {
  branch?: string | null;
  commitOid?: string | null;
  filePath?: string | null;
  remoteName?: string | null;
}

export function parseRemoteBaseUrl(rawRemote: string): string | null {
  if (!rawRemote) return null;
  let trimmed = rawRemote.trim();
  if (!trimmed) return null;

  // Handle SSH scp-like syntax: git@github.com:owner/repo.git
  const scpMatch = trimmed.match(/^(?:[\w-]+@)?([^:]+):(.*)$/);
  if (scpMatch && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('ssh://')) {
    const host = scpMatch[1];
    let path = scpMatch[2].replace(/^\/+/, '');
    path = path.replace(/\.git$/, '');
    return `https://${host}/${path}`;
  }

  // Handle ssh:// url syntax: ssh://git@github.com/owner/repo.git
  if (trimmed.startsWith('ssh://')) {
    trimmed = trimmed.replace(/^ssh:\/\/(?:[\w-]+@)?/, 'https://');
  }

  // Ensure standard https:// or http://
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Strip user info if present: https://username@github.com/...
    trimmed = trimmed.replace(/^(https?:\/\/)[^/@]+@/, '$1');
    trimmed = trimmed.replace(/\.git$/, '');
    trimmed = trimmed.replace(/\/+$/, '');
    return trimmed;
  }

  return null;
}

export function buildWebUrl(remoteUrl: string, options: WebUrlOptions = {}): string | null {
  const base = parseRemoteBaseUrl(remoteUrl);
  if (!base) return null;

  const { branch, commitOid, filePath, remoteName } = options;
  const isGitLab = base.includes('gitlab.');
  const isBitbucket = base.includes('bitbucket.');
  const isAzure = base.includes('dev.azure.com') || base.includes('visualstudio.com');

  // 1. Specific file in commit or branch
  if (filePath) {
    const cleanPath = filePath.replace(/^\/+/, '').trim();
    const cleanOid = commitOid?.trim();
    const ref = cleanOid || branch;
    if (isAzure) {
      const versionParam = cleanOid ? `version=GC${cleanOid}` : branch ? `version=GB${encodeURIComponent(branch)}` : '';
      const query = [
        `path=${encodeURIComponent(`/${cleanPath}`)}`,
        versionParam,
      ].filter(Boolean).join('&');
      return `${base}?${query}`;
    }
    if (isGitLab) {
      return ref ? `${base}/-/blob/${ref}/${cleanPath}` : `${base}/-/blob/HEAD/${cleanPath}`;
    }
    if (isBitbucket) {
      return ref ? `${base}/src/${ref}/${cleanPath}` : `${base}/src/HEAD/${cleanPath}`;
    }
    // GitHub / Generic
    return ref ? `${base}/blob/${ref}/${cleanPath}` : `${base}/blob/HEAD/${cleanPath}`;
  }

  // 2. Specific commit
  if (commitOid) {
    const cleanOid = commitOid.trim();
    if (cleanOid) {
      if (isAzure) {
        return `${base}/commit/${cleanOid}`;
      }
      if (isGitLab) {
        return `${base}/-/commit/${cleanOid}`;
      }
      if (isBitbucket) {
        return `${base}/commits/${cleanOid}`;
      }
      return `${base}/commit/${cleanOid}`;
    }
  }

  // 3. Specific branch
  if (branch) {
    // Strip local or remote prefixes if any
    let cleanBranch = branch.trim();
    if (cleanBranch.startsWith('refs/heads/')) cleanBranch = cleanBranch.slice(11);
    if (cleanBranch.startsWith('refs/remotes/')) cleanBranch = cleanBranch.slice(13);
    if (cleanBranch.startsWith('remotes/')) cleanBranch = cleanBranch.slice(8);
    if (remoteName && cleanBranch.startsWith(`${remoteName}/`)) {
      cleanBranch = cleanBranch.slice(remoteName.length + 1);
    } else if (cleanBranch.startsWith('origin/')) {
      cleanBranch = cleanBranch.slice(7);
    }

    if (!cleanBranch || cleanBranch === 'HEAD') {
      return base;
    }

    if (isAzure) {
      return `${base}?version=GB${encodeURIComponent(cleanBranch)}`;
    }
    if (isGitLab) {
      return `${base}/-/tree/${cleanBranch}`;
    }
    if (isBitbucket) {
      return `${base}/src/${cleanBranch}`;
    }
    return `${base}/tree/${cleanBranch}`;
  }

  // 4. Default to repository root
  return base;
}
