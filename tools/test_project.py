"""Build entry points must reject invalid targets before invoking build tools."""
import subprocess
import sys
import json
import struct
import tempfile
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

import project


class PackagingPreflightTests(unittest.TestCase):
    def reject_entrypoint(self, action, target_args, host='linux', arch='amd64'):
        with ExitStack() as stack:
            stack.enter_context(patch.object(project, 'HOST', host))
            stack.enter_context(patch.object(project, 'ARCH', arch))
            stack.enter_context(patch.object(sys, 'argv', ['project.py', action, *target_args]))
            effects = [stack.enter_context(patch.object(project, name))
                       for name in ('doctor', 'check', 'cli', 'run', 'paths', 'npm')]
            with self.assertRaises(RuntimeError) as error:
                project.main()
            for effect in effects:
                effect.assert_not_called()
            self.assertIn('make release-artifacts REF=main', str(error.exception))
            return str(error.exception)

    def test_unsupported_os_fails_before_tools_or_output_writes(self):
        for action in ('build', 'package', 'compile', 'package-native'):
            with self.subTest(action=action):
                message = self.reject_entrypoint(action, ['--os', 'freebsd', '--arch', 'amd64'])
                self.assertIn('Unsupported desktop target freebsd/amd64', message)

    def test_foreign_native_os_and_unsupported_architecture_fail_early(self):
        for action in ('build', 'package', 'package-native'):
            for osname in ('darwin', 'windows'):
                for arch in ('amd64', 'arm64'):
                    with self.subTest(action=action, os=osname, arch=arch):
                        message = self.reject_entrypoint(action, ['--os', osname, '--arch', arch])
                        self.assertIn(f'requires a {osname} host', message)
            with self.subTest(action=action, arch='386'):
                message = self.reject_entrypoint(action, ['--os', 'windows', '--arch', '386'], host='windows')
                self.assertIn('Unsupported desktop target windows/386', message)

    def test_six_native_targets_and_windows_cross_compile_are_allowed(self):
        for osname in ('darwin', 'windows', 'linux'):
            for arch in ('arm64', 'amd64'):
                args = SimpleNamespace(os=osname, arch=arch, version='v0.1.0')
                with self.subTest(os=osname, arch=arch), patch.object(project, 'HOST', osname), patch.object(project, 'ARCH', arch):
                    project.validate_desktop_target(args, native=True)
        with patch.object(project, 'HOST', 'linux'):
            for arch in ('amd64', 'arm64'):
                project.validate_desktop_target(SimpleNamespace(os='windows', arch=arch, version='v0.1.0'))

    def test_unconfigured_linux_cross_architecture_fails_before_tools(self):
        for action in ('build', 'package', 'compile', 'package-native'):
            with self.subTest(action=action):
                message = self.reject_entrypoint(action, ['--os', 'linux', '--arch', 'arm64'])
                self.assertIn('requires a matching native linux/arm64 host', message)

    def test_missing_linux_libraries_fail_before_build_checks(self):
        with patch.object(project, 'HOST', 'linux'), patch.object(project, 'ARCH', 'amd64'), \
                patch.object(sys, 'argv', ['project.py', 'package']), \
                patch.object(project.shutil, 'which', return_value='/tool'), \
                patch.object(project.subprocess, 'run', return_value=SimpleNamespace(returncode=1)), \
                patch.object(project, 'check') as checks, patch.object(project, 'cli') as cli:
            with self.assertRaisesRegex(RuntimeError, 'sudo apt-get install.*libgtk-4-dev.*libwebkitgtk-6.0-dev'):
                project.main()
            checks.assert_not_called()
            cli.assert_not_called()

    def test_optimized_python_still_rejects_unsupported_target(self):
        result = subprocess.run(
            [sys.executable, '-O', str(project.ROOT / 'tools/project.py'), 'package', '--os', 'linux', '--arch', '386'],
            cwd=project.ROOT, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')
        self.assertIn('Unsupported desktop target linux/386', result.stderr)
        self.assertIn('make release-artifacts REF=main', result.stderr)


class LinuxArtifactsTests(unittest.TestCase):
    def test_package_collector_ignores_fast_pr_checks_and_other_versions(self):
        def run(event,title):
            return {'event':event,'workflowName':'Desktop packages','displayTitle':title}
        wanted=run('workflow_dispatch','Desktop packages v1.2.3 (main)')
        runs=[run('pull_request','Desktop packages checks (15/merge)'),
              run('workflow_dispatch','Desktop packages v1.2.2 (main)'),wanted]
        self.assertEqual(project.package_runs(runs,'v1.2.3'),[wanted])

    def test_elf_architecture_and_invalid_binary_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            binary=Path(directory)/'Bible'
            for arch,machine in (('amd64',62),('arm64',183)):
                header=bytearray(64);header[:6]=b'\x7fELF\x02\x01';struct.pack_into('<H',header,18,machine)
                binary.write_bytes(header)
                project.binary_arch(binary,'linux',arch)
                with self.assertRaises(RuntimeError):project.binary_arch(binary,'linux','arm64' if arch=='amd64' else 'amd64')
            for data in (b'',b'MZ'+b'\x00'*62,b'\x7fELF\x01\x01'+b'\x00'*58):
                binary.write_bytes(data)
                with self.assertRaises(RuntimeError):project.binary_arch(binary,'linux','amd64')

    def test_distribution_requires_six_targets_matching_hashes_and_clean_source(self):
        self.assertEqual(len(project.TARGETS),6)
        self.assertIn(('linux','amd64'),project.TARGETS)
        self.assertIn(('linux','arm64'),project.TARGETS)
        with tempfile.TemporaryDirectory() as directory, patch.object(project,'ROOT',Path(directory)):
            dest=Path(directory)/'dist/v0.1.0';dest.mkdir(parents=True)
            for osname,arch in project.TARGETS:
                prefix=f'bible-v0.1.0-{osname}-{arch}'
                suffixes=('.tar.gz','.deb') if osname=='linux' else ('.zip','.dmg' if osname=='darwin' else '-installer.exe')
                paths=[dest/(prefix+suffix) for suffix in suffixes]
                for path in paths:path.write_bytes(b'fixture '+path.name.encode())
                (dest/f'{prefix}-manifest.json').write_text(json.dumps({'version':'v0.1.0','os':osname,'arch':arch,'commit':'same-source','artifacts':{path.name:project.sha(path) for path in paths}}))
            args=SimpleNamespace(version='v0.1.0')
            project.dist(args)
            self.assertEqual(len((dest/'SHA256SUMS').read_text().splitlines()),18)
            target=dest/'bible-v0.1.0-linux-arm64-manifest.json';original=target.read_text();target.unlink()
            with self.assertRaisesRegex(AssertionError,'missing target manifest'):project.dist(args)
            data=json.loads(original);data['workingTreeDirty']=True;target.write_text(json.dumps(data))
            with self.assertRaisesRegex(AssertionError,'dirty working-tree'):project.dist(args)
            target.write_text(original)
            (dest/'bible-v0.1.0-linux-arm64.deb').write_bytes(b'changed')
            with self.assertRaisesRegex(AssertionError,'absent or modified artifact'):project.dist(args)


if __name__ == '__main__':
    unittest.main()
