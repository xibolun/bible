# Project instructions

Read `/home/anolis/project/MamreTek/mamre-workspace/standards/README.md` before development work, then load its task-specific rules and templates.

On this machine use the current central rules. If the central source is unavailable, use `docs/development-conventions.md` as the portable fallback and report its version. New Web applications use React with Ant Design (`antd`).

Explicit user instructions and recorded project decisions override defaults. Preserve existing contracts and unrelated changes. Resolve the Mamre workflow record in `~/.codex/mamre/projects/` by normalized origin identity; worktrees share their repository's record. Requirements stay outside this source repository at that record's configured path. Do not create project-local `.codex` directories as part of initialization.

The initializer supplies conventions and workflow discovery, not a runnable application scaffold or a completed frontend migration. Validate repository and issue-provider bindings before issue-backed planning or implementation.
