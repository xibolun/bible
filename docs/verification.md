# Verification boundaries

`make check` runs packaging-preflight and SWORD text-conversion regressions, Go formatting, vet and behavior
tests, frontend lint/typecheck, six selection/layout unit cases, a production
build, data integrity and owned
branding-input checks. The interval suite includes a per-character fuzz model;
SQLite tests verify rollback, restart, idempotence and future-schema retention.
The packaging regressions verify that unsupported targets, foreign native
hosts, unconfigured Linux cross-architecture CGO and missing Linux libraries
fail before build checks/output writes, including under Python `-O`, while all
six native targets and Windows binary cross-compilation remain allowed.
SWORD conversion cases preserve verse wording, divine-name capitalization and
layout boundaries while removing notes/titles. Data checks require complete
CUV/WEBP/KJV catalogs; KJV source samples and selected-pair copy/card service
cases guard against silently using WEBP or including an unselected translation.

Browser end-to-end tests use a production build of the explicit Mock adapter.
They exercise book/chapter navigation, Chinese/English and KJV/WEBP comparison, offline
operations after loading bundled assets, highlight persistence across reload,
clipboard content, exact PNG dimensions, focus-mode exit, cross-column
selection rejection, visible data errors and direct export retry after a save
failure without losing editor state. Screenshots and an actual exported
PNG are uploaded with the browser report. These tests do not substitute for a
native first-launch/offline check.
The KJV flow checks distinct pair selection, KJV highlight persistence after
reload, comparison clipboard content without WEBP contamination and an actual
KJV comparison-card PNG download. It also checks that translation selectors
and reading controls remain visible at the minimum 1024×640 window size.

The native matrix builds on macOS arm64/Intel, Windows arm64/amd64 and Ubuntu
24.04 arm64/amd64 runners, inspects Mach-O/PE/ELF headers and produces all six
package sets. Linux builds validate their desktop entry, compute Debian shared
library dependencies and package the owned icon and legal notices. Opt-in smoke mode
uses a separate database, launches the actual WebView, exercises generated Go
bindings, reads a complete bilingual chapter, persists/reloads a highlight,
round-trips the native clipboard, renders and writes a real PNG, then repeats
with the same test directory. Reports record the actual OS/architecture. macOS
DMGs and ad-hoc signatures are checked by system tools. Windows NSIS source
compilation is part of packaging. A Windows Server runner is not evidence of
manual Windows 11 desktop acceptance.
Native smoke also reads the real SWORD KJV text through the Go bridge and uses
CUV+KJV for the clipboard/card path, verifying the returned KJV edition label.

Linux native smoke runs in a private D-Bus session with Xvfb and software
rendering. It exercises the real GTK4/WebKitGTK frontend and Go services, not
the browser Mock adapter. It does not prove interactive portal dialogs,
Wayland compositing, desktop integration or compatibility with every Linux
distribution. Local Ubuntu 26.04 builds record newer runtime dependencies;
Ubuntu 24.04 CI packages have a different minimum runtime than local builds.
On Ubuntu's restricted runner, CI loads the package's application-specific
AppArmor `userns` profile with the exact test binary path. Global kernel
restrictions and WebKit sandboxing remain enabled. Profile syntax, Debian
control-script permissions and the exact executable attachment are verified;
the tar archive does not install a system profile automatically.

The following remain explicit manual release checks, rather than automated
smoke claims:

- Fresh installed-app launch with networking disabled and required system
  WebView runtime already present.
- Native save-dialog cancellation/overwrite and denied-directory recovery.
- Interactive installer/uninstaller appearance, shortcuts and retained user
  data; inspection of the DMG's Finder layout and all branded system surfaces.
- Native maximize/restore, macOS full screen, monitor disconnect and restored
  window placement, 125%/150% system scaling and keyboard-only workflows.
- All three card templates and both sizes with representative long bilingual
  selections, full text and font rendering on each platform.
- Recorded hardware/OS measurements for cold start, p95 chapter/highlight
  latency and export timing. An automated suite duration is not such evidence.
- Developer ID signing/notarization and Windows release signing when public
  distribution is requested and credentials are supplied.

Consult the linked CI run and PR for actual results. Failed/missing jobs are not
passed targets, unsigned/adhoc artifacts are not signed public releases, and
manual checks must not be silently checked off by the packaging script.
