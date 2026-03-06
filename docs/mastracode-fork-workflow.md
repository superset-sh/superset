# Mastracode Fork Bundle Workflow

This repo resolves `mastracode` from a Superset-managed fork bundle:

- Fork repo: `https://github.com/superset-sh/mastra`
- Current bundle release: `mastracode-v0.4.0-superset.5`
- Dependency override location: root `package.json` -> `resolutions.mastracode`

## Why

`mastracode` is a monorepo subpackage, so direct git dependency specs resolve the repo root package instead of `mastracode`. We use a versioned tarball release asset from our fork for deterministic installs.

## Local clone for contributors

Use a dedicated local clone for the Superset fork:

```bash
git clone https://github.com/superset-sh/mastra.git ~/workplace/mastra-superset
git -C ~/workplace/mastra-superset remote add upstream https://github.com/mastra-ai/mastra.git
```

Recommended remote model:

- `origin` -> `superset-sh/mastra`
- `upstream` -> `mastra-ai/mastra`

Keep this separate from personal fork clones to avoid pushing internal release tags/branches to the wrong remote.

## Superset worktree convention

For day-to-day fork work, use a separate worktree under the Superset worktrees directory.

Current team path:

- `$HOME/.superset/worktrees/mastra-superset/<owner>/<branch>`

Example setup from the local fork clone:

```bash
WORKTREE_DIR="$HOME/.superset/worktrees/mastra-superset/<owner>/<branch>"
git -C ~/workplace/mastra-superset worktree add \
  "$WORKTREE_DIR" \
  -b <owner>/<branch> \
  origin/main
```

Expected remotes in that worktree:

- `origin` -> `https://github.com/superset-sh/mastra.git`
- `upstream` -> `https://github.com/mastra-ai/mastra.git`

## Current behavior shipped in the bundle

- Tool executions are wrapped with Mastra `HookManager` pre/post hooks.
- `createAuthStorage()` is exported for auth-only storage usage without runtime bootstrap.

## Superset runtime wiring

`@superset/chat-mastra` uses Mastra's built-in tool set from `createMastraCode()`.

Desktop pass-through lives at:

- `apps/desktop/src/lib/trpc/routers/chat-mastra-service/index.ts`

Core runtime creation and tool diagnostics live at:

- `packages/chat-mastra/src/server/trpc/utils/runtime/runtime.ts`

## Debugging tool registration

When `NODE_ENV !== "production"` (or `SUPERSET_DEBUG_HOOKS` is enabled), runtime startup logs:

- `resolvedToolNames` (tools actually visible to the agent at runtime)

## Publishing the next internal bundle

1. Prepare package contents from the patched local `mastracode` install:

```bash
WORKDIR=$(mktemp -d)
cp -R node_modules/mastracode "$WORKDIR/mastracode"
cd "$WORKDIR/mastracode"
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.version="0.4.0-superset.X";fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");'
npm pack
```

2. Publish tarball to fork release:

```bash
gh release create mastracode-v0.4.0-superset.X ./mastracode-0.4.0-superset.X.tgz \
  -R superset-sh/mastra \
  --title "mastracode v0.4.0-superset.X" \
  --notes "Superset internal mastracode bundle"
```

3. Update root `package.json` `resolutions.mastracode` URL to the new release asset.

4. Run install:

```bash
bun install
```

5. Verify lockfile points to the release URL:

```bash
rg -n "mastracode-v0.4.0-superset|mastracode@https://github.com/superset-sh/mastra/releases/download" bun.lock package.json
```
