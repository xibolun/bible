# Verification boundaries

Search shares native/Mock fixtures for ordered wildcards, Unicode underscores,
literal escapes, ASCII case behavior and SQL-looking text treated as data. Go
checks exercise real bundled text, pagination, empty results and invalid inputs.
Browser checks verify toolbar order, removed focus/edge controls, shortcut
contexts, offline search, translation switching and same-chapter verse jumps.
Dictionary checks require Chinese meanings in the opening viewport before
English statistics. Native smoke searches for Genesis 1:1 through the Go bridge.

Word-study regressions check real offline Hebrew/Greek lookups and KJV verse
associations, Chinese definitions, invalid references and dictionary numbers,
source importer escapes, duplicate records and preservation of source script.
Browser cases cover opening from a CUV selection, Chinese definitions, offline
lookup, visible data errors and retry. Native smoke traverses the Go bridge for
Hebrew, Greek and verse links. Reading palette checks measure text contrast;
browser cases change soft palettes and preserve theme, reading position and
highlights across reload. NSIS input checks require owned welcome/header art
and DisplayIcon; installer appearance remains a platform manual check.

Linux icon integration additionally extracts the built deb and resolves the
desktop entry's named icon through GTK4 at 16, 24, 32, 48, 64, 128, 256 and 512
pixels. Every resolved file must come from the extracted package, preventing a
host-installed icon from masking a broken bundle. The regression was reproduced
with the old 1024-only package returning image-missing. Actual compositor/Dock
rendering and stale user-created launcher overrides still require desktop checks.

`make check` runs packaging-preflight and SWORD text-conversion regressions, Go formatting, vet and behavior
tests, frontend lint/typecheck, selection/layout unit cases, a production
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
clipboard content, exact PNG dimensions, stable reader navigation, mixed-translation
selection rejection, visible data errors and direct export retry after a save
failure without losing editor state. Screenshots and an actual exported
PNG are uploaded with the browser report. These tests do not substitute for a
native first-launch/offline check.
The KJV flow checks all-three vertical ordering, source verse numbers without repeated edition labels,
compact line height, KJV highlight persistence after reload, three-version
clipboard/card output, and removal of an unselected version from comparison
copying. Minimum 1024×640 cases cover wrapping all 150 Psalm chapters, real text
dragging, Shift-range selection, keyboard copy, endpoint toolbar placement,
window-edge avoidance, scroll anchoring and dismissal. Settings cases migrate
legacy preferences, switch Chinese/English UI, persist font size/reference
position and verify About and English card controls. Service regressions check
the same copy options and settings without changing existing annotations.
Shared user-supplied golden examples verify seven reference styles in Go and
TypeScript, including exact punctuation, full/abbreviated book names, optional
editions and per-verse prefixes. Browser cases check all seven copied strings,
per-verse and edition-free PNGs, persisted style selection, external source
navigation and context-aware chapter shortcuts/boundaries. Card layout tests preserve
explicit line breaks and prevent closing punctuation from starting a line.

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
Native smoke also reads the real SWORD KJV text through the Go bridge, round-trips
the new font/language/reference settings, and uses CUV+KJV+WEBP for clipboard/card
paths, verifying all three returned editions. No browser adapter is substituted.
Smoke reports also require the rendered interface version to match the native
binary/package version. Source-browser launch and native file dialogs remain
manual desktop integration checks.

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

The reusable matrix collector validates all six package sets, clean source
commit, version/architecture, hashes and successful native reports through
`tools/release.py validate`, generating a release index without publishing.
Release unit tests use synthetic bundles and a fake provider for missing,
corrupt, wrong-version/source, failed-runtime and interrupted-upload cases;
published reruns retain assets and validate their original index. Tests also
exercise version tags merged into main and reject moved/unmerged tags, including
under Python `-O`. Workflow syntax is checked with actionlint 1.7.12. Only the
tag/manual release workflow receives publishing permission, as confirmed by the
user for github-actions[bot]; tests do not create real releases.
