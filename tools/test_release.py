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
        self.login = 'xibolun'
        self.deleted = []
        self.note_updates = 0
        self.fail_delete_once = False

    def identity(self):
        return self.login

    def view(self, tag):
        if self.release is None:
            return None
        return {**self.release, 'assets': [
            {'id': int(hashlib.sha256(name.encode()).hexdigest()[:8], 16),
             'name': name, 'size': len(data), 'digest': 'sha256:' + hashlib.sha256(data).hexdigest()}
            for name, data in self.files.items()]}

    def create(self, tag, body):
        self.release = {'id': 42, 'tag_name': tag, 'draft': True, 'body': body}

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

    def update_notes(self, tag, body):
        self.note_updates += 1
        self.release['body'] = body

    def delete_asset(self, asset):
        if self.fail_delete_once and len(self.deleted) == 2:
            self.fail_delete_once = False
            raise RuntimeError('simulated deletion interruption')
        self.deleted.append(asset['name'])
        del self.files[asset['name']]


def legacy_publication(directory):
    bundle(directory)
    paths = release.validate(TAG, COMMIT, directory)
    client = FakeGitHub()
    client.create(TAG, f'Bible {TAG}\n\nCustom release introduction.\n\n## Downloads\n\nold table\n\n<!-- bible-release-source:{COMMIT} -->')
    client.upload(TAG, paths)
    client.publish(TAG, COMMIT)
    return client


class ReleaseTests(unittest.TestCase):
    def test_only_four_installers_are_published_after_full_bundle_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); bundle(directory)
            client = FakeGitHub()
            release.publish(TAG, COMMIT, directory, client)
            expected = {f'bible-{TAG}-windows-amd64-installer.exe', f'bible-{TAG}-darwin-arm64.dmg',
                        f'bible-{TAG}-darwin-amd64.dmg', f'bible-{TAG}-linux-amd64.deb'}
            self.assertEqual(set(client.files), expected)
            self.assertEqual(len(list(directory.iterdir())), 26)
            body = client.release['body']
            self.assertIn('<summary>SHA-256 checksums</summary>', body)
            for name, data in client.files.items():
                self.assertIn(hashlib.sha256(data).hexdigest() + '  ' + name, body)
                self.assertIn('/releases/download/' + TAG + '/' + name, body)
            self.assertNotIn('.zip)', body)
            self.assertNotIn('.json)', body)
            release.verify_published(client, client.view(TAG), TAG, COMMIT)

    def test_legacy_published_release_remains_valid_and_unchanged_on_retry(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); client = legacy_publication(directory)
            before = dict(client.files)
            bundle(directory, 'different timestamps')
            release.publish(TAG, COMMIT, directory, client)
            self.assertEqual(client.files, before)
            self.assertEqual(client.uploads, 1)
            self.assertEqual(client.note_updates, 0)

    def test_release_notes_accept_windows_line_endings_without_duplicate_sections(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); bundle(directory); client = FakeGitHub()
            release.publish(TAG, COMMIT, directory, client)
            client.release['body'] = client.release['body'].replace('\n', '\r\n')
            release.verify_published(client, client.view(TAG), TAG, COMMIT)
            intro = release.introduction(client.release['body'])
            self.assertNotIn('## Downloads', intro)
            release.prune(TAG, COMMIT, directory / 'backup', client, apply=True)
            self.assertEqual(client.note_updates, 0)

    def test_interrupted_draft_rebuild_updates_checksums_before_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); bundle(directory); client = FakeGitHub()
            client.fail_once = True
            with self.assertRaises(RuntimeError): release.publish(TAG, COMMIT, directory, client)
            previous = client.release['body']
            bundle(directory, 'rebuilt draft')
            release.publish(TAG, COMMIT, directory, client)
            self.assertNotEqual(client.release['body'], previous)
            release.verify_published(client, client.view(TAG), TAG, COMMIT)

    def test_changed_draft_checksum_metadata_cannot_be_published(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); bundle(directory); client = FakeGitHub()
            upload = client.upload
            def tamper(tag, paths):
                upload(tag, paths)
                client.release['body'] = client.release['body'].replace(COMMIT, 'b' * 40)
            client.upload = tamper
            with self.assertRaisesRegex(ValueError, 'policy/source'):
                release.publish(TAG, COMMIT, directory, client)
            self.assertEqual(client.publications, 0)
            self.assertTrue(client.release['draft'])

    def test_compact_source_policy_checksums_duplicates_and_extra_assets_are_rejected(self):
        for change in ('source', 'policy', 'checksum', 'duplicate', 'extra', 'missing'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as folder:
                directory = Path(folder); bundle(directory); client = FakeGitHub()
                release.publish(TAG, COMMIT, directory, client)
                body = client.release['body']
                if change == 'source': client.release['body'] = body.replace(COMMIT, 'b' * 40)
                if change == 'policy': client.release['body'] = body.replace(release.PUBLIC_POLICY, '')
                if change == 'checksum':
                    checksum = release.digest(directory / next(iter(client.files)))
                    client.release['body'] = body.replace(checksum, '0' * 64)
                if change == 'extra': client.files['unrelated.zip'] = b'extra'
                if change == 'missing': del client.files[next(iter(client.files))]
                metadata = client.view(TAG)
                if change == 'duplicate': metadata['assets'].append(metadata['assets'][0])
                with self.assertRaises(ValueError): release.verify_published(client, metadata, TAG, COMMIT)
                self.assertEqual(client.uploads, 1)

    def test_cleanup_preview_backs_up_without_mutation_and_apply_keeps_exact_installers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); client = legacy_publication(root)
            before = client.view(TAG)
            original_files = dict(client.files)
            backup = root / 'backup'
            plan = release.prune(TAG, COMMIT, backup, client)
            self.assertEqual(len(plan['keep']), 4)
            self.assertEqual(len(plan['remove']), 22)
            self.assertFalse(plan['applied'])
            self.assertEqual(client.view(TAG), before)
            self.assertEqual(json.loads((backup / 'release-before.json').read_text()), before)
            self.assertEqual(client.note_updates, 0)
            result = release.prune(TAG, COMMIT, backup, client, apply=True)
            self.assertTrue(result['applied'])
            self.assertEqual(set(client.files), release.installer_names(TAG))
            self.assertEqual(client.files, {name: original_files[name] for name in plan['keep']})
            self.assertIn('Custom release introduction.', client.release['body'])
            self.assertEqual(set(client.deleted), set(plan['remove']))
            self.assertTrue((backup / 'release-after.json').is_file())
            retained = client.view(TAG)
            release.prune(TAG, COMMIT, backup, client, apply=True)
            self.assertEqual(client.view(TAG), retained)
            self.assertEqual(len(client.deleted), 22)
            self.assertEqual(client.note_updates, 1)

    def test_cleanup_resumes_after_interruption_using_verified_original_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); client = legacy_publication(root)
            backup = root / 'backup'; client.fail_delete_once = True
            with self.assertRaisesRegex(RuntimeError, 'deletion interruption'):
                release.prune(TAG, COMMIT, backup, client, apply=True)
            self.assertEqual(len(client.files), 24)
            with self.assertRaisesRegex(ValueError, 'backup is required'):
                release.prune(TAG, COMMIT, root / 'missing-backup', client, apply=True)
            release.prune(TAG, COMMIT, backup, client, apply=True)
            self.assertEqual(len(client.deleted), 22)
            self.assertEqual(len(set(client.deleted)), 22)
            release.verify_published(client, client.view(TAG), TAG, COMMIT)

    def test_completed_cleanup_still_checks_retained_installers_against_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); client = legacy_publication(root); backup = root / 'backup'
            release.prune(TAG, COMMIT, backup, client, apply=True)
            installer = sorted(client.files)[0]
            client.files[installer] = b'replaced installer'
            checksums = {name: hashlib.sha256(data).hexdigest() for name, data in client.files.items()}
            client.release['body'] = release.notes(TAG, COMMIT, checksums)
            with self.assertRaisesRegex(ValueError, 'Asset changed since backup'):
                release.prune(TAG, COMMIT, backup, client, apply=True)
            self.assertEqual(len(client.deleted), 22)
            self.assertEqual(client.note_updates, 1)

    def test_cleanup_refuses_changed_source_assets_release_or_backup(self):
        for change in ('account', 'source', 'installer', 'extra', 'missing', 'identity', 'backup'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); client = legacy_publication(root); backup = root / 'backup'
                release.prune(TAG, COMMIT, backup, client)
                installer = sorted(release.installer_names(TAG))[0]
                if change == 'account': client.login = 'another-account'
                if change == 'source': client.release['body'] = client.release['body'].replace(COMMIT, 'b' * 40)
                if change == 'installer': client.files[installer] = b'tampered'
                if change == 'extra': client.files['unknown.zip'] = b'extra'
                if change == 'missing': del client.files[installer]
                if change == 'identity': client.release['id'] = 43
                if change == 'backup': (backup / 'SHA256SUMS').write_text('tampered')
                with self.assertRaises(ValueError): release.prune(TAG, COMMIT, backup, client, apply=True)
                self.assertEqual(client.deleted, [])
                self.assertEqual(client.note_updates, 0)

    def test_cleanup_rejects_unknown_assets_before_creating_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); client = legacy_publication(root)
            client.files['unknown.zip'] = b'extra'
            with self.assertRaises(ValueError): release.prune(TAG, COMMIT, root / 'backup', client, apply=True)
            self.assertFalse((root / 'backup/release-before.json').exists())
            self.assertEqual(client.deleted, [])

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
