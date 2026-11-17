"""Exercise complete-bundle gates and publication without creating real releases."""
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import release

TAG = 'v1.2.3'
COMMIT = 'a' * 40


def bundle(directory, marker='first', version=TAG):
    for system, architecture in release.TARGETS:
        prefix = f'bible-{version}-{system}-{architecture}'
        names = [prefix + '.tar.gz', prefix + '.deb'] if system == 'linux' else [
            prefix + '.zip', prefix + ('.dmg' if system == 'darwin' else '-installer.exe')]
        for name in names:
            (directory / name).write_bytes((name + marker).encode())
        metadata = {'os': system, 'arch': architecture, 'version': version, 'commit': COMMIT,
                    'workingTreeDirty': False, 'artifacts': {name: release.digest(directory / name) for name in names}}
        (directory / (prefix + '-manifest.json')).write_text(json.dumps(metadata))
        report = {'os': system, 'arch': architecture, 'version': version, 'frontendVersion': version,
                  'passed': True, 'nativeWebview': True, 'clipboardRoundTrip': True}
        (directory / (prefix + '-native-smoke.json')).write_text(json.dumps(report))


class FakeGitHub:
    def __init__(self):
        self.release = None
        self.files = {}
        self.publications = 0
        self.uploads = 0
        self.fail_once = False

    def view(self, tag):
        if self.release is None:
            return None
        return {**self.release, 'assets': [
            {'name': name, 'size': len(data), 'digest': 'sha256:' + hashlib.sha256(data).hexdigest()}
            for name, data in self.files.items()]}

    def create(self, tag, body):
        self.release = {'tag_name': tag, 'draft': True, 'body': body}

    def upload(self, tag, paths):
        self.uploads += 1
        for index, path in enumerate(paths):
            self.files[path.name] = path.read_bytes()
            if self.fail_once and index == 3:
                self.fail_once = False
                raise RuntimeError('simulated upload interruption')

    def download(self, tag, directory):
        for name in ('release-manifest.json', 'SHA256SUMS'):
            (directory / name).write_bytes(self.files[name])

    def publish(self, tag, commit):
        self.publications += 1
        self.release['draft'] = False


class ReleaseTests(unittest.TestCase):
    def test_github_lookup_finds_drafts_and_does_not_hide_authentication_failures(self):
        missing = SimpleNamespace(returncode=1, stdout='{"status":"404"}', stderr='not found')
        draft = {'id': 42, 'tag_name': TAG, 'draft': True, 'assets': []}
        pages = SimpleNamespace(returncode=0, stdout=json.dumps([[{'tag_name': 'v0.1.0'}], [draft]]))
        with patch.object(release.subprocess, 'run', side_effect=[missing, pages]) as run:
            self.assertEqual(release.GitHub().view(TAG), draft)
            self.assertIn('--paginate', run.call_args.args[0])
        with patch.object(release.subprocess, 'run', side_effect=[missing, SimpleNamespace(returncode=0, stdout='[[]]')]):
            self.assertIsNone(release.GitHub().view(TAG))
        denied = SimpleNamespace(returncode=1, stdout='{"status":"403"}', stderr='forbidden')
        with patch.object(release.subprocess, 'run', return_value=denied) as run:
            with self.assertRaisesRegex(RuntimeError, 'forbidden'): release.GitHub().view(TAG)
            self.assertEqual(run.call_count, 1)
        with patch.object(release.subprocess, 'run', side_effect=[missing, denied]):
            with self.assertRaisesRegex(RuntimeError, 'drafts'): release.GitHub().view(TAG)

    def test_github_publication_rechecks_the_tag_before_running_the_cli(self):
        client = release.GitHub()
        with patch.object(release, 'source') as source, patch.object(release.subprocess, 'run') as run:
            client.publish(TAG, COMMIT)
            source.assert_called_once_with(TAG, expected=COMMIT, refresh=True)
            run.assert_called_once_with(['gh', 'release', 'edit', TAG, '--repo', release.REPOSITORY,
                                         '--draft=false', '--verify-tag'], check=True)
        with patch.object(release, 'source', side_effect=ValueError('tag moved')), patch.object(release.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'tag moved'):
                client.publish(TAG, COMMIT)
            run.assert_not_called()

    def test_internal_unprefixed_build_versions_remain_valid_but_cannot_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder);bundle(directory,version='1.2.3')
            self.assertEqual(len(release.validate('1.2.3',COMMIT,directory)),26)
            with self.assertRaisesRegex(ValueError,'vX.Y.Z'):
                release.publish('1.2.3',COMMIT,directory,FakeGitHub())

    def test_complete_bundle_has_all_six_targets_and_hashes(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            bundle(directory)
            assets = release.validate(TAG, COMMIT, directory)
            self.assertEqual(len(assets), 26)
            index = json.loads((directory / 'release-manifest.json').read_text())
            self.assertEqual(set(index['targets']), {f'{system}/{arch}' for system, arch in release.TARGETS})
            for name, item in index['files'].items():
                self.assertEqual(release.digest(directory / name), item['sha256'])

    def test_missing_wrong_dirty_corrupt_or_unverified_bundles_cannot_publish(self):
        changes = [('manifest', 'version', 'v9.9.9'), ('manifest', 'commit', 'b' * 40),
                   ('manifest', 'arch', 'arm64'), ('manifest', 'workingTreeDirty', True),
                   ('smoke', 'passed', False), ('smoke', 'frontendVersion', 'v0.0.0')]
        for kind, field, value in changes:
            with self.subTest(kind=kind, field=field), tempfile.TemporaryDirectory() as folder:
                directory = Path(folder)
                bundle(directory)
                suffix = '-manifest.json' if kind == 'manifest' else '-native-smoke.json'
                path = directory / (f'bible-{TAG}-linux-amd64' + suffix)
                metadata = json.loads(path.read_text()); metadata[field] = value
                path.write_text(json.dumps(metadata))
                client = FakeGitHub()
                with self.assertRaises(ValueError):
                    release.publish(TAG, COMMIT, directory, client)
                self.assertIsNone(client.release)
        for operation in ('missing', 'corrupt'):
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as folder:
                directory = Path(folder); bundle(directory)
                path = directory / f'bible-{TAG}-linux-amd64.deb'
                path.unlink() if operation == 'missing' else path.write_bytes(b'tampered')
                with self.assertRaises(ValueError): release.validate(TAG, COMMIT, directory)

    def test_interrupted_upload_stays_draft_and_retry_finishes_once(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); bundle(directory)
            client = FakeGitHub(); client.fail_once = True
            with self.assertRaisesRegex(RuntimeError, 'upload interruption'):
                release.publish(TAG, COMMIT, directory, client)
            self.assertTrue(client.release['draft'])
            self.assertEqual(client.publications, 0)
            release.publish(TAG, COMMIT, directory, client)
            self.assertFalse(client.release['draft'])
            self.assertEqual(client.publications, 1)

    def test_published_retry_retains_assets_and_detects_tampering(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); bundle(directory)
            client = FakeGitHub()
            release.publish(TAG, COMMIT, directory, client)
            published = dict(client.files)
            bundle(directory, 'different package timestamps')
            self.assertIn('Already published', release.publish(TAG, COMMIT, directory, client))
            self.assertEqual(client.files, published)
            self.assertEqual(client.uploads, 1)
            self.assertEqual(client.publications, 1)
            client.files[f'bible-{TAG}-linux-amd64.deb'] = b'tampered'
            with self.assertRaisesRegex(ValueError, 'integrity failure'):
                release.publish(TAG, COMMIT, directory, client)

    def test_tag_must_be_versioned_merged_and_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'work'; root.mkdir()
            def git(*args):
                return subprocess.check_output(['git', '-c', 'user.name=xibolun', '-c',
                    'user.email=14323159+xibolun@users.noreply.github.com', *args], cwd=root, text=True).strip()
            git('init', '-q', '-b', 'main')
            (root / 'README').write_text('fixture'); git('add', 'README'); git('commit', '-qm', 'fixture')
            commit = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', commit)
            git('tag', '-a', TAG, '-m', TAG)
            self.assertEqual(release.source(TAG, root), commit)
            remote = Path(folder) / 'remote.git'
            git('init', '-q', '--bare', str(remote)); git('remote', 'add', 'origin', str(remote))
            git('push', '-q', 'origin', 'main', TAG)
            self.assertEqual(release.source(TAG, root, commit, refresh=True), commit)
            with self.assertRaisesRegex(ValueError, 'moved'): release.source(TAG, root, 'b' * 40)
            with self.assertRaisesRegex(ValueError, 'vX.Y.Z'): release.source('main', root)
            git('switch', '-qc', 'unmerged'); (root / 'README').write_text('new'); git('commit', '-qam', 'unmerged')
            git('tag', 'v2.0.0')
            with self.assertRaisesRegex(ValueError, 'merged into main'): release.source('v2.0.0', root)
            git('push', '-q', 'origin', 'unmerged')
            git('--git-dir', str(remote), 'update-ref', 'refs/tags/' + TAG, git('rev-parse', 'HEAD'))
            with self.assertRaisesRegex(ValueError, 'moved'):
                release.source(TAG, root, commit, refresh=True)
            self.assertEqual(git('rev-parse', TAG + '^{commit}'), commit)


if __name__ == '__main__':
    unittest.main()
