"""Build entry points must reject invalid targets before invoking build tools."""
import subprocess
import sys
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

import project


class PackagingPreflightTests(unittest.TestCase):
    def reject_entrypoint(self, action, target_args, host='linux'):
        with ExitStack() as stack:
            stack.enter_context(patch.object(project, 'HOST', host))
            stack.enter_context(patch.object(sys, 'argv', ['project.py', action, *target_args]))
            effects = [stack.enter_context(patch.object(project, name))
                       for name in ('doctor', 'check', 'cli', 'run', 'paths', 'npm')]
            with self.assertRaises(RuntimeError) as error:
                project.main()
            for effect in effects:
                effect.assert_not_called()
            self.assertIn('make release-artifacts REF=main', str(error.exception))
            return str(error.exception)

    def test_linux_defaults_fail_before_tools_or_output_writes(self):
        for action in ('build', 'package', 'compile', 'package-native'):
            with self.subTest(action=action):
                message = self.reject_entrypoint(action, ['--arch', 'amd64'])
                self.assertIn('Unsupported desktop target linux/amd64', message)

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

    def test_four_native_targets_and_windows_cross_compile_remain_allowed(self):
        for osname in ('darwin', 'windows'):
            for arch in ('arm64', 'amd64'):
                args = SimpleNamespace(os=osname, arch=arch, version='v0.1.0')
                with self.subTest(os=osname, arch=arch), patch.object(project, 'HOST', osname):
                    project.validate_desktop_target(args, native=True)
        with patch.object(project, 'HOST', 'linux'):
            for arch in ('amd64', 'arm64'):
                project.validate_desktop_target(SimpleNamespace(os='windows', arch=arch, version='v0.1.0'))

    def test_optimized_python_still_rejects_unsupported_target(self):
        result = subprocess.run(
            [sys.executable, '-O', str(project.ROOT / 'tools/project.py'), 'package', '--os', 'linux', '--arch', 'amd64'],
            cwd=project.ROOT, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')
        self.assertIn('Unsupported desktop target linux/amd64', result.stderr)
        self.assertIn('make release-artifacts REF=main', result.stderr)


if __name__ == '__main__':
    unittest.main()
