# Verification boundaries

Local edition import tests use self-authored CC0 synthetic text, with distinct
MyBible/MySword SQLite schemas, theWord line-position profiles, OSIS container
and milestone structures, Zefania XML, a one-resource ZIP and native SWORD zText ZIP modules. They verify source
labels, missing/blank positions, joined/split records, Unicode and line breaks,
metadata, cancellation, unknown tags, malicious ZIP/XML/schema input and limits.
Library/service tests cover atomic rollback, duplicate installs, replacement,
version restoration, tombstone identity, future schema preservation, per-request
snapshots and interrupted cross-database annotation purge recovery after restart.
Real Go services exercise imported reading, LIKE search, highlighting, clipboard,
card and projection data. Browser tests use only the explicitly labeled Zefania
Mock, including minimum-window/large-font preview, multiline text, offline
read/search/copy/card/projection and disabled-duplicate recovery. These are not
claims that every platform module or every versification is supported.

GZIP regressions cover a real compressed resource, HTTP-decoded SQLite retaining
a `.gz` filename, bounded output, CRC/truncation, multiple members, trailing data,
nested archives and staging cleanup. MySword ASV-style wrapper rules use exact
text-preserving recognition, never source regex execution; synthetic Hebrew and
combining-character samples verify that text survives. The compressed native
service fixture proceeds through inspection, install, reading/search/copy/cards,
projection and version/annotation recovery. A local check of the official ASV
2.3.7 download and its HTTP-decoded database produces the same 66-book / 1189-
chapter / 31,102-record content fingerprint. That corpus stays outside source and
CI artifacts; regression fixtures remain self-authored synthetic text.

Linux local native QA additionally uses an isolated profile and GTK portal to
select a real file, preview and install it, delete the source, restart and read
the persisted partial edition, then remove it and verify fallback. This verifies
that host's chooser/bridge/storage path, not macOS/Windows dialogs, installers or
all Linux portals. See `edition-import.md` for supported profiles and limits.

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
a CUV-only catalogue, exact legacy text/version fingerprints and no additional
bundled scripture. SWORD fixtures verify module/testament/book/chapter index
slots, linked ranges, bounds, zlib checksums and padding, unsupported profiles,
unknown OSIS markup and cancellation. Native services inspect and install a
synthetic SWORD ZIP, compare its linked source range, search/copy/card/project,
and retain text/highlights after source deletion and library restart.

The supplied Darby 2.0 file is checked locally; its corpus is not committed or
included in CI artifacts. Independent KJV word-study checks run without a
bundled KJV edition. Preference regressions remove obsolete WEBP/KJV/DBY references
while preserving reading settings and valid history.

Browser end-to-end tests use a production build of the explicit Mock adapter.
They exercise book/chapter navigation, Chinese/English CUV/WEBP comparison, offline
operations after loading bundled assets, highlight persistence across reload,
clipboard content, exact PNG dimensions, stable reader navigation, mixed-translation
selection rejection, visible data errors and direct export retry after a save
failure without losing editor state. Screenshots and an actual exported
PNG are uploaded with the browser report. These tests do not substitute for a
native first-launch/offline check.

Projection dropdown tests wait for the documented chapter-focus advance after
each book suggestion click and scope suggestions to the book combobox's controlled
list. A regression repeats the same English/Pinyin queries with 90 ms delayed
animation frames and 6x Chromium CPU throttling; the normal minimum-window,
large-font layout and publication checks remain in place.
Quick-entry dropdowns open and close immediately: a delayed leave animation
could detach a reopened suggestion between mouse down and mouse up, losing the
selection. The pressure case also runs repeatedly with traces during this fix.

The CUV/WEBP flow checks vertical ordering, source verse numbers without repeated
edition labels, compact line height, highlight persistence across reload and
two-version clipboard/card output. Minimum 1024×640 cases cover wrapping all 150 Psalm chapters, real text
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
CrossWire tests use local HTTP servers and synthetic CC0 module/index fixtures
for Chinese/English filtering, supported/unsupported profiles, notices, explicit
preview/confirmation, progress, cancellation, source changes, download errors,
unsafe redirects, checksum/path validation and staging cleanup. NRSV tests use
explicit additional/final slot offsets to guard against verse shifts. Browser
bilingual regressions install an explicit CI-only WEBP excerpt fixture rather
than adding scripture to production assets.

Edition management browser coverage also checks the integrated installed/download
views, a single settings drawer without catalogue/details modals, preserved
search/language filters, read-only bundled CUV, provenance-based installed status
after renaming, shared row actions, inline version recovery, failed-source
isolation from local management, and 1024×640 layout at 20px global type.
Changing UI language also retains the cached catalogue without a source request.

SWORD inscription regressions use self-authored CC0 text to check nested words,
supplied text, combining characters, divine names, excluded notes, line breaks
and cross-verse fragments. Archive tests cover all three supported block types;
service tests cover download, exact preview, explicit confirmation and exact
offline reading. Unknown descendants and namespaces remain rejected. Live KJV
validation uses ignored private files rather than adding its corpus to fixtures.

Native smoke checks that the bundled catalogue contains only CUV,
reads it through the Go bridge, round-trips font/language/reference settings
and verifies CUV in clipboard/card paths. Independent Strong’s lookup
and verse associations remain covered. No browser adapter is substituted.
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
published reruns retain assets and validate either their legacy index or the
compact release-notes policy/source/checksum records. Public publication uploads
only four installers after the complete six-target bundle passes. Cleanup cases
verify read-only preview, original metadata/index backups, interrupted deletion
and resume, idempotency, retained asset IDs/digests and rejection of changed or
unknown assets. No existing package needs rebuilding for cleanup. Tests also
exercise version tags merged into main and reject moved/unmerged tags, including
under Python `-O`. Workflow syntax is checked with actionlint 1.7.12. Only the
tag/manual release workflow receives publishing permission, as confirmed by the
user for github-actions[bot]; tests do not create real releases.
