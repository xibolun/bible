# Bible

A desktop Bible reader built with Go and Wails: Chinese/English offline reading,
verse-aligned comparison, persistent text highlights, copying, focus reading,
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
No command silently installs operating-system dependencies. Linux can run code
and browser checks; desktop distribution targets are macOS and Windows.

```sh
make package                                      # On macOS/Windows: current host target
make package GOOS=darwin GOARCH=arm64 VERSION=v0.1.0
make package GOOS=windows GOARCH=amd64 VERSION=v0.1.0
make smoke                                        # Matching native machine only
make dist VERSION=v0.1.0                          # Require all four target packages
```

Build and package each target on its matching OS. On Linux, `make build` and
`make package` stop before dependency/build checks and explain the supported
alternatives. Setting `GOOS=darwin` or `GOOS=windows` does not supply a native
packaging toolchain.

To obtain all four package sets from Linux (or another host), authenticate
GitHub CLI as `xibolun` and explicitly collect the CI artifacts:

```sh
make check
make release-artifacts REF=main VERSION=v0.1.0
```

The artifact command defaults to `main`; `REF` can select an issue branch or
commit. It waits for CI and downloads the packages; it can dispatch the native
matrix when no run exists. It requires network access and GitHub CLI credentials.
Local build/package commands never start remote builds automatically.

Outputs include architecture-specific
macOS app ZIP/DMG or Windows portable ZIP/NSIS installer, plus build manifests
and SHA-256 checksums under `dist/<version>/`. macOS packages are ad-hoc signed,
not notarized; Windows packages are unsigned. These are internal test artifacts.
The workflow does not publish a GitHub Release or merge a PR.

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

Both complete translations and a CJK font are bundled. Source versions, hashes
and conversion details are in `data/manifest.json` and `data/font.json`.
`tools/import_data.py` rebuilds text from the pinned publisher archives and a
plain SWORD export; it rejects unknown lines and duplicate references. Run
`make verify-data` after regeneration. `tools/create_icons.py` and
`wails3 generate icons` regenerate the owned icon assets. The font subset was
produced with fontTools 4.60.1 using the ranges recorded in its manifest.

Desktop annotations and preferences are stored in the platform user-config
directory, under `Bible/user.db`; the installed scripture remains read-only.
Migration failures preserve the database. Uninstallation retains user data.
Cards are saved to a path chosen through the native PNG save dialog.

Windows requires the Microsoft WebView2 Runtime. The installer detects a missing
runtime and offers the Microsoft download page with explicit user interaction.
Offline reading does not imply that a machine missing its system runtime can
install fully offline.

Third-party texts and dependency notices are included in
`THIRD_PARTY_NOTICES.txt` and `licenses/`. No original-source open-source
license has been selected. See `docs/project-decisions.md` for desktop-specific
engineering decisions and the limits of automated native smoke checks.
