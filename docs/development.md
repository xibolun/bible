# Development, builds and verification

A desktop Bible reader built with Go and Wails: Chinese/English offline reading,
verse-aligned comparison, persistent text highlights, copying, offline search,
and scripture-card PNG export.

The initial implementation is tracked in [Issue #1](https://github.com/xibolun/bible/issues/1).

## Development

Use Go **1.26.10**, Node **22.22.1** (or a compatible Node 22.12+), npm, Python 3.12+,
GNU Make, and the pinned Wails CLI:

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
make doctor
make check
make dev
```

Native macOS builds require Xcode Command Line Tools. Native Windows builds
require NSIS and WebView2; add GNU Make and NSIS to PATH (Git Bash is supported).
Native Linux builds use GTK4/WebKitGTK 6.0 and a C compiler. On Ubuntu 24.04+
or a compatible Debian release, install the declared dependencies explicitly:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev libx11-dev dpkg-dev
```

No command silently installs operating-system dependencies. Desktop targets
are Linux, macOS and Windows on amd64 and arm64.

```sh
make package                                      # Current native OS/architecture
make package GOOS=linux GOARCH=amd64 VERSION=v0.1.0
make package GOOS=darwin GOARCH=arm64 VERSION=v0.1.0
make package GOOS=windows GOARCH=amd64 VERSION=v0.1.0
make smoke                                        # Matching native machine only
make dist VERSION=v0.1.0                          # Require all six target packages
```

Build and package each target on its matching OS. Linux CGO builds also require
a matching host architecture. Unsupported host/target combinations and missing
Linux build libraries are diagnosed before the full checks. Setting `GOOS`
does not install a foreign SDK or configure a cross-compilation toolchain.

To obtain all six package sets from one host, authenticate
GitHub CLI as `xibolun` and explicitly collect the CI artifacts:

```sh
make check
make release-artifacts REF=main VERSION=v0.1.0
```

The artifact command defaults to `main`; `REF` can select an issue branch or
commit. It reuses a manual package run for the exact version or explicitly
dispatches the native matrix. Fast PR checks are not package runs. It requires
network access and GitHub CLI credentials.
Local build/package commands never start remote builds automatically.

Outputs include architecture-specific Linux tar.gz/deb, macOS app ZIP/DMG and
Windows portable ZIP/NSIS installer, plus build manifests
and SHA-256 checksums under `dist/<version>/`. macOS packages are ad-hoc signed,
not notarized; Windows packages are unsigned. The desktop build workflow only
produces artifacts. The separate [release workflow](releases.md) publishes
complete, verified version-tag bundles; neither workflow merges pull requests.
PR/merge checks run formatting, unit tests, frontend build, a compile check and
browser regressions. Six-target packaging, native runtime smoke and package
aggregation run only for releases or explicit manual requests.

On Linux, run `bin/linux-amd64/Bible` after a build (use `linux-arm64` on ARM),
or extract the tar.gz bundle and run its `Bible` executable. Install the deb with
`sudo apt install ./dist/v0.1.0/bible-v0.1.0-linux-amd64.deb` for a system desktop
entry and the `bible` command. Packages retain annotations on removal.

Linux binaries link to system GTK4/WebKitGTK libraries. Runtime packages on
Ubuntu/Debian are `libgtk-4-1` and `libwebkitgtk-6.0-4`; file dialogs use
`xdg-desktop-portal` with a suitable desktop backend. The deb records actual
shared-library dependencies. CI builds on Ubuntu 24.04; local builds record the
host libc/GTK/WebKit versions in their manifest and are not promised to run on
older distributions. RPM, AppImage and universal Linux compatibility are not
part of this build path.

Ubuntu releases that restrict unprivileged user namespaces require an AppArmor
rule for WebKit's bubblewrap sandbox. The deb includes a profile attached only
to `/usr/bin/bible`, loaded on installation when AppArmor supports it and
unloaded on removal. It permits `userns` for this executable while retaining the
system restriction and WebKit sandbox. Prefer the deb on those systems; a tar
binary at another path needs an administrator-provided profile for that exact
path. CI uses the same profile with its test binary path.

For headless native smoke checks, additionally install `xvfb xauth dbus-x11`
and run:

```sh
GDK_BACKEND=x11 GSK_RENDERER=cairo LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x800x24' make smoke
```

This launches the real Linux WebView twice with isolated test data. Interactive
file dialogs and real Wayland/multi-monitor behavior still need manual checks.

## Browser prototype and checks

The explicit browser prototype uses the same bundled text and a Mock adapter.
Its highlights are stored in browser storage and are separate from desktop data.

```sh
cd frontend
npm ci
VITE_DATA_MODE=mock npm run dev
npm run test -- --run
npx playwright install chromium
npm run test:e2e
```

In PowerShell, set `$env:VITE_DATA_MODE='mock'` before `npm run dev`.
The prototype visibly identifies simulated services. Native mode never falls
back to Mock success when the Go bridge is unavailable.

## Data, fonts and user files

Three complete translations (CUV, WEBP and SWORD KJV 3.1) and a CJK font are bundled. Source versions, hashes
and conversion details are in `data/manifest.json` and `data/font.json`.
`tools/import_data.py` rebuilds text from the pinned publisher archives and a
CUV plain export and KJV raw per-verse OSIS export; it rejects unknown lines and duplicate references. Run
`make verify-data` after regeneration. `tools/create_icons.py` regenerates all
owned PNG/ICO/ICNS icons and Windows installer artwork from `frontend/public/bible.svg`
(optional asset-only tooling: CairoSVG 2.8.2 and Pillow 12.x). The font subset was
produced with fontTools 4.60.1 using the ranges recorded in its manifest.

Choose a primary translation and any of the other installed translations for
comparison, including all three bundled editions. Corresponding passages are
stacked vertically with compact spacing and source verse numbers.
Chapter buttons wrap, including all 150 Psalms. Click a verse number
to select a passage, Shift-click for a range, or select text directly. Actions
appear near the selection endpoint and stay within the window.

Settings include Light, Warm paper, Soft sage and Quiet night reading palettes,
reading font size (14–32), Chinese/English interface language,
copy reference position, seven reference presets and About. Toolbar and keyboard
copying always retain book/chapter/verse references; full/abbreviated names,
edition labels and per-verse prefixes follow the selected preset.
Comparison copying and cards use only the visible selected translations.
Legacy preferences receive defaults for the added fields without resetting
reading positions or annotations. Interface language is independent of scripture.
Existing CUV/WEBP text versions and highlights are retained. See
[scripture sources and rebuilding](scripture-sources.md) for exact module
versions, permissions, transformation rules and rebuild commands. NIV remains
pending authorized data in [Issue #6](https://github.com/xibolun/bible/issues/6),
as confirmed by the user; no NIV text is currently included.

Desktop annotations and preferences are stored in the platform user-config
directory, under `Bible/user.db`; the installed scripture remains read-only.
Migration failures preserve the database. Uninstallation retains user data.
Cards are saved to a path chosen through the native PNG save dialog.

The toolbar Dictionary action and selected-passage Word study action open the
offline Chinese dictionary. Lookup accepts Strong’s H/G numbers; verse links
use KJV word groups explicitly, including when reading CUV alone. Chinese
definitions preserve the source Traditional Chinese and English definitions
are expandable. Immutable word study and Chinese dictionaries have independent
manifests and native/Mock copies; `make verify-data` checks both. Rebuild inputs
and license locations are documented in [scripture sources](scripture-sources.md).

Windows requires the Microsoft WebView2 Runtime. The installer detects a missing
runtime and offers the Microsoft download page with explicit user interaction.
Offline reading does not imply that a machine missing its system runtime can
install fully offline.

Third-party texts and dependency notices are included in
`THIRD_PARTY_NOTICES.txt` and `licenses/`. No original-source open-source
license has been selected. See `docs/project-decisions.md` for desktop-specific
engineering decisions and the limits of automated native smoke checks.
