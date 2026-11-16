# Desktop product decisions

- Go + Wails v3.1.0, with Go 1.26.10. React + strict TypeScript + Vite + Ant Design is the embedded frontend. The desktop uses native local services; no HTTP application server, cloud account, go-zero, MySQL, Redis, or container deployment is introduced.
- The requested book/chapter/verse reading layout takes precedence over the general administration-dashboard layout. Common Ant Design controls, restrained tokens, feedback and keyboard conventions are retained.
- The first version bundles simplified Chinese CUV (CrossWire ChiUns 3.1) and English WEBP (eBible snapshot 2026-11-13), and uses the 66-book canon. Texts are never aligned by list position. Source verse labels are retained; unavailable verses are shown explicitly.
- `VITE_DATA_MODE=mock` selects the visible browser prototype. Native mode uses generated Go bindings and never silently falls back to browser data or storage. Mock and native data are derived from the same pinned conversion.
- Production desktop targets are macOS 12+ and Windows 11 on amd64 and arm64. Linux is a code/browser verification host, not a distributed desktop target. Cross-compiling a Windows binary is useful verification but does not replace native runtime testing.
- The user explicitly requested public repository visibility. Original application code has no selected open-source license; public visibility alone does not grant one.
- Main is protected. The README-only baseline was committed on a separate bootstrap branch, then used to create main. All application work belongs to issue/1 and a PR. Nothing in this workflow authorizes a merge or release publication.
- Packaging uses stable Taskfile tasks wrapped by Makefile. Mac packages are ad-hoc signed and not notarized; Windows packages are unsigned internal test artifacts. Developer ID/Windows signing credentials are not bundled or assumed.
- Owned icons and plain DMG layout replace template branding. Dependency names and copyright notices remain in third-party license files.
- Native smoke mode is opt-in (`--smoke-test` plus `BIBLE_SMOKE_DIR`), uses isolated test data, exercises the real WebView/Go bridge, clipboard and PNG writing twice, and does not automate native save-dialog interaction or claim manual installation/fullscreen acceptance.
