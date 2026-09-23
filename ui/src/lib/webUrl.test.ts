import { describe, expect, it } from 'vitest';
import { buildWebUrl, parseRemoteBaseUrl } from './webUrl';

describe('webUrl', () => {
  describe('parseRemoteBaseUrl', () => {
    it('handles SSH scp syntax for GitHub', () => {
      expect(parseRemoteBaseUrl('git@github.com:maicondallg/Gitma.git')).toBe(
        'https://github.com/maicondallg/Gitma'
      );
    });

    it('handles HTTPS URLs with .git', () => {
      expect(parseRemoteBaseUrl('https://github.com/maicondallg/Gitma.git')).toBe(
        'https://github.com/maicondallg/Gitma'
      );
    });

    it('handles SSH URLs with ssh:// prefix', () => {
      expect(parseRemoteBaseUrl('ssh://git@gitlab.com/group/subgroup/repo.git')).toBe(
        'https://gitlab.com/group/subgroup/repo'
      );
    });

    it('handles Azure DevOps git URLs', () => {
      expect(
        parseRemoteBaseUrl('https://dev.azure.com/myorg/myproject/_git/myrepo')
      ).toBe('https://dev.azure.com/myorg/myproject/_git/myrepo');
    });

    it('returns null for empty or invalid remote', () => {
      expect(parseRemoteBaseUrl('')).toBeNull();
      expect(parseRemoteBaseUrl('   ')).toBeNull();
    });
  });

  describe('buildWebUrl', () => {
    const ghRemote = 'git@github.com:maicondallg/Gitma.git';
    const glRemote = 'git@gitlab.com:company/project.git';
    const bbRemote = 'https://bitbucket.org/team/repo.git';

    it('builds repository root URL when no options provided', () => {
      expect(buildWebUrl(ghRemote)).toBe('https://github.com/maicondallg/Gitma');
      expect(buildWebUrl(glRemote)).toBe('https://gitlab.com/company/project');
      expect(buildWebUrl(bbRemote)).toBe('https://bitbucket.org/team/repo');
    });

    it('builds branch URL for GitHub, GitLab, and Bitbucket', () => {
      expect(buildWebUrl(ghRemote, { branch: 'main' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/main'
      );
      expect(buildWebUrl(ghRemote, { branch: 'feature/login' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/feature/login'
      );
      expect(buildWebUrl(glRemote, { branch: 'develop' })).toBe(
        'https://gitlab.com/company/project/-/tree/develop'
      );
      expect(buildWebUrl(bbRemote, { branch: 'master' })).toBe(
        'https://bitbucket.org/team/repo/src/master'
      );
    });

    it('strips origin/ and refs/heads/ from branch name', () => {
      expect(buildWebUrl(ghRemote, { branch: 'origin/feature-1' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/feature-1'
      );
      expect(buildWebUrl(ghRemote, { branch: 'refs/heads/v2' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/v2'
      );
      expect(buildWebUrl(ghRemote, { branch: 'refs/remotes/origin/develop' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/develop'
      );
      expect(buildWebUrl(ghRemote, { branch: 'remotes/origin/develop' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/develop'
      );
      expect(buildWebUrl(ghRemote, { branch: 'upstream/feature-x', remoteName: 'upstream' })).toBe(
        'https://github.com/maicondallg/Gitma/tree/feature-x'
      );
      expect(buildWebUrl(ghRemote, { branch: 'HEAD' })).toBe(
        'https://github.com/maicondallg/Gitma'
      );
    });

    it('builds commit URL for GitHub, GitLab, and Bitbucket', () => {
      expect(buildWebUrl(ghRemote, { commitOid: '269e930' })).toBe(
        'https://github.com/maicondallg/Gitma/commit/269e930'
      );
      expect(buildWebUrl(glRemote, { commitOid: 'abcdef1' })).toBe(
        'https://gitlab.com/company/project/-/commit/abcdef1'
      );
      expect(buildWebUrl(bbRemote, { commitOid: '9988776' })).toBe(
        'https://bitbucket.org/team/repo/commits/9988776'
      );
    });

    it('builds file URL with commit or branch', () => {
      expect(
        buildWebUrl(ghRemote, { commitOid: '269e930', filePath: 'src/main.rs' })
      ).toBe('https://github.com/maicondallg/Gitma/blob/269e930/src/main.rs');

      expect(
        buildWebUrl(glRemote, { branch: 'main', filePath: 'ui/App.tsx' })
      ).toBe('https://gitlab.com/company/project/-/blob/main/ui/App.tsx');

      expect(
        buildWebUrl(bbRemote, { branch: 'master', filePath: 'README.md' })
      ).toBe('https://bitbucket.org/team/repo/src/master/README.md');
    });
  });
});
