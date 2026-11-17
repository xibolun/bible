"""Validate complete desktop bundles and publish them only after all checks pass."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from project import ROOT, TARGETS

REPOSITORY = 'xibolun/bible'
VERSION = re.compile(r'v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source(tag, root=ROOT, expected=None, refresh=False):
    require(VERSION.fullmatch(tag), 'Release tags must use vX.Y.Z without leading zeroes')
    commit = subprocess.check_output(['git', 'rev-parse', f'refs/tags/{tag}^{{commit}}'], cwd=root, text=True).strip()
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'origin/main'], cwd=root).returncode == 0,
            'Release tag must identify a commit merged into main')
    require(expected is None or expected == commit, 'Release tag moved after the build started')
    if refresh:
        # Fetch only FETCH_HEAD so the final publication gate observes the
        # current remote tag without overwriting any local tag or branch.
        subprocess.run(['git', 'fetch', '--no-tags', 'origin', f'refs/tags/{tag}'], cwd=root, check=True)
        remote = subprocess.check_output(['git', 'rev-parse', 'FETCH_HEAD^{commit}'], cwd=root, text=True).strip()
        require(remote == commit, 'Release tag moved after the build started')
    return commit


def target_files(tag):
    names = set()
    for system, architecture in TARGETS:
        prefix = f'bible-{tag}-{system}-{architecture}'
        names.update([prefix + '-manifest.json', prefix + '-native-smoke.json'])
        names.update([prefix + '.tar.gz', prefix + '.deb'] if system == 'linux'
                     else [prefix + '.zip', prefix + ('.dmg' if system == 'darwin' else '-installer.exe')])
    return names


def validate(tag, commit, directory):
    require(re.fullmatch(r'v?[0-9]+\.[0-9]+\.[0-9]+', tag), 'Package versions must use X.Y.Z or vX.Y.Z')
    require(re.fullmatch(r'[0-9a-f]{40}', commit), 'Expected a source commit SHA')
    directory = Path(directory)
    names = target_files(tag)
    for name in names:
        path = directory / name
        require(path.is_file() and not path.is_symlink() and path.stat().st_size > 0, f'Missing or invalid asset: {name}')
    for system, architecture in TARGETS:
        prefix = f'bible-{tag}-{system}-{architecture}'
        metadata = json.loads((directory / (prefix + '-manifest.json')).read_text(encoding='utf-8'))
        require(metadata['version'] == tag and metadata['os'] == system and metadata['arch'] == architecture,
                f'Target/version mismatch: {prefix}')
        require(metadata['commit'] == commit and metadata.get('workingTreeDirty') is False, f'Source mismatch: {prefix}')
        packages = {prefix + '.tar.gz', prefix + '.deb'} if system == 'linux' else {
            prefix + '.zip', prefix + ('.dmg' if system == 'darwin' else '-installer.exe')}
        require(set(metadata['artifacts']) == packages, f'Unexpected package set: {prefix}')
        for name, checksum in metadata['artifacts'].items():
            require(digest(directory / name) == checksum, f'Checksum mismatch: {name}')
        report = json.loads((directory / (prefix + '-native-smoke.json')).read_text(encoding='utf-8'))
        require(all(report.get(key) is True for key in ('passed', 'nativeWebview', 'clipboardRoundTrip')),
                f'Native verification did not pass: {prefix}')
        require(report.get('os') == system and report.get('arch') == architecture
                and report.get('version') == tag and report.get('frontendVersion') == tag,
                f'Runtime/UI version mismatch: {prefix}')
    index = {'version': tag, 'commit': commit, 'targets': [f'{system}/{arch}' for system, arch in TARGETS],
             'files': {name: {'sha256': digest(directory / name), 'size': (directory / name).stat().st_size}
                       for name in sorted(names)}}
    (directory / 'release-manifest.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    names.add('release-manifest.json')
    (directory / 'SHA256SUMS').write_text(''.join(f'{digest(directory / name)}  {name}\n' for name in sorted(names)), encoding='utf-8')
    names.add('SHA256SUMS')
    return [directory / name for name in sorted(names)]


def notes(tag, commit):
    lines = [f'Bible {tag}', '', f'Source commit: `{commit}`', '',
             '| Platform | Architecture | Downloads |', '| --- | --- | --- |']
    for system, architecture in TARGETS:
        prefix = f'bible-{tag}-{system}-{architecture}'
        extensions = [('.deb', 'DEB'), ('.tar.gz', 'tar.gz')] if system == 'linux' else [
            ('.dmg' if system == 'darwin' else '-installer.exe', 'Installer'), ('.zip', 'Portable ZIP')]
        links = ' · '.join(f'[{label}](https://github.com/{REPOSITORY}/releases/download/{tag}/{prefix}{extension})'
                           for extension, label in extensions)
        lines.append(f'| {system} | {architecture} | {links} |')
    lines += ['', 'All six targets passed checks and two native WebView/Go smoke launches. '
              'Package, runtime and interface versions match this tag.', '',
              'SHA256SUMS and release-manifest.json identify every asset. '
              'macOS builds are ad-hoc signed and not notarized; Windows builds are unsigned. '
              'Linux requires system GTK4/WebKitGTK 6.0 libraries. See README for installation.',
              '', f'<!-- bible-release-source:{commit} -->', '']
    return '\n'.join(lines)


class GitHub:
    def view(self, tag):
        result = subprocess.run(['gh', 'api', f'repos/{REPOSITORY}/releases/tags/{tag}'], capture_output=True, text=True)
        if result.returncode:
            try:
                missing = str(json.loads(result.stdout).get('status')) == '404'
            except (ValueError, AttributeError):
                missing = False
            if missing:
                # The tag endpoint finds published releases. Drafts are visible
                # in the authenticated list for a caller with push access.
                drafts = subprocess.run(['gh', 'api', '--paginate', '--slurp',
                                         f'repos/{REPOSITORY}/releases?per_page=100'], capture_output=True, text=True)
                if drafts.returncode:
                    raise RuntimeError('Could not inspect release drafts: ' + drafts.stderr.strip())
                matches = [item for page in json.loads(drafts.stdout) for item in page if item['tag_name'] == tag]
                require(len(matches) <= 1, 'Multiple releases identify the same tag')
                return matches[0] if matches else None
            raise RuntimeError('Could not inspect the existing release: ' + result.stderr.strip())
        return json.loads(result.stdout)

    def create(self, tag, body):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'notes.md'
            path.write_text(body, encoding='utf-8')
            subprocess.run(['gh', 'release', 'create', tag, '--repo', REPOSITORY, '--draft', '--verify-tag',
                            '--title', f'Bible {tag}', '--notes-file', str(path)], check=True)

    def upload(self, tag, paths):
        subprocess.run(['gh', 'release', 'upload', tag, '--repo', REPOSITORY, '--clobber', *map(str, paths)], check=True)

    def download(self, tag, directory):
        subprocess.run(['gh', 'release', 'download', tag, '--repo', REPOSITORY, '--dir', str(directory),
                        '--pattern', 'release-manifest.json', '--pattern', 'SHA256SUMS'], check=True)

    def publish(self, tag, commit):
        source(tag, expected=commit, refresh=True)
        subprocess.run(['gh', 'release', 'edit', tag, '--repo', REPOSITORY, '--draft=false', '--verify-tag'], check=True)


def verify_remote(release, paths):
    assets = {asset['name']: asset for asset in release['assets']}
    require(len(assets) == len(release['assets']) and set(assets) == {path.name for path in paths}, 'Release asset set is incomplete')
    for path in paths:
        asset = assets[path.name]
        require(asset.get('digest') == 'sha256:' + digest(path) and asset['size'] == path.stat().st_size,
                f'Uploaded asset differs: {path.name}')


def verify_published(client, release, tag, commit):
    # Rebuilt packages can differ in timestamps. Verify the existing publication
    # against its own complete index; never overwrite published assets on a retry.
    with tempfile.TemporaryDirectory() as folder:
        directory = Path(folder)
        client.download(tag, directory)
        index_path = directory / 'release-manifest.json'
        index = json.loads(index_path.read_text(encoding='utf-8'))
        require(index.get('version') == tag and index.get('commit') == commit, 'Published release identifies another source')
        require(set(index['files']) == target_files(tag), 'Published target index is incomplete')
        assets = {asset['name']: asset for asset in release['assets']}
        expected = set(index['files']) | {'release-manifest.json', 'SHA256SUMS'}
        require(len(assets) == len(release['assets']) and set(assets) == expected, 'Published release is incomplete')
        checksums = {name: value['sha256'] for name, value in index['files'].items()}
        checksums['release-manifest.json'] = digest(index_path)
        text = ''.join(f'{checksum}  {name}\n' for name, checksum in sorted(checksums.items()))
        require((directory / 'SHA256SUMS').read_text(encoding='utf-8') == text, 'Published checksums disagree with the index')
        checksums['SHA256SUMS'] = digest(directory / 'SHA256SUMS')
        for name, checksum in checksums.items():
            require(assets[name].get('digest') == 'sha256:' + checksum, f'Published asset integrity failure: {name}')


def publish(tag, commit, directory, client):
    require(VERSION.fullmatch(tag), 'Release tags must use vX.Y.Z')
    paths = validate(tag, commit, directory)
    release = client.view(tag)
    if release and not release['draft']:
        verify_published(client, release, tag, commit)
        return 'Already published and complete; assets retained'
    if release:
        require(f'<!-- bible-release-source:{commit} -->' in release.get('body', ''), 'Existing draft belongs to another source')
        require({asset['name'] for asset in release['assets']} <= {path.name for path in paths}, 'Draft has unrelated assets')
    else:
        client.create(tag, notes(tag, commit))
    client.upload(tag, paths)
    release = client.view(tag)
    require(release is not None and release['draft'], 'Release draft changed during upload')
    verify_remote(release, paths)
    client.publish(tag, commit)
    return f'Published {tag} with all six targets'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'validate', 'publish'])
    parser.add_argument('--tag', required=True)
    parser.add_argument('--commit')
    parser.add_argument('--directory', type=Path)
    args = parser.parse_args()
    if args.action == 'prepare':
        commit = source(args.tag)
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write(f'version={args.tag}\nsha={commit}\n')
        print(f'Validated {args.tag} at {commit}')
        return
    commit = args.commit or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    directory = args.directory or ROOT / 'dist' / args.tag
    if args.action == 'validate':
        print(f'Validated {len(validate(args.tag, commit, directory))} release assets without publishing')
    else:
        require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_REPOSITORY') == REPOSITORY,
                'Publish through the repository tag workflow; local checks use validate')
        source(args.tag, expected=commit)
        print(publish(args.tag, commit, directory, GitHub()))


if __name__ == '__main__':
    main()
