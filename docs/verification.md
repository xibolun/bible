# Verification boundaries

`make check` runs Go formatting, vet and behavior tests, frontend lint/typecheck,
six selection/layout unit cases, a production build, data integrity and owned
branding-input checks. The interval suite includes a per-character fuzz model;
SQLite tests verify rollback, restart, idempotence and future-schema retention.

Browser end-to-end tests use a production build of the explicit Mock adapter.
They exercise book/chapter navigation, Chinese/English comparison, offline
operations after loading bundled assets, highlight persistence across reload,
clipboard content, exact PNG dimensions, focus-mode exit, cross-column
selection rejection and visible data errors. Screenshots and an actual exported
PNG are uploaded with the browser report. These tests do not substitute for a
native first-launch/offline check.

The native matrix builds on macOS arm64/Intel and Windows arm64/amd64 runners,
inspects Mach-O/PE headers and produces all four package sets. Opt-in smoke mode
uses a separate database, launches the actual WebView, exercises generated Go
bindings, reads a complete bilingual chapter, persists/reloads a highlight,
round-trips the native clipboard, renders and writes a real PNG, then repeats
with the same test directory. Reports record the actual OS/architecture. macOS
DMGs and ad-hoc signatures are checked by system tools. Windows NSIS source
compilation is part of packaging. A Windows Server runner is not evidence of
manual Windows 11 desktop acceptance.

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
