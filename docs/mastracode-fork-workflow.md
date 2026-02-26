# Mastracode Fork Bundle Workflow

This repo resolves `mastracode` from a Superset-managed fork bundle:

- Fork repo: `https://github.com/superset-sh/mastra`
- Current bundle release: `mastracode-v0.4.0-superset.1`
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

## Current behavior shipped in the bundle

- Per-tool `deny` hides tools from dynamic tool exposure (not just execution).
- Tool guidance omits denied tools.
- `createMastraCode({ extraTools })` is merged into runtime dynamic tools.

## Publishing the next internal bundle

1. Prepare package contents from the patched local `mastracode` install:

```bash
WORKDIR=$(mktemp -d)
cp -R node_modules/mastracode "$WORKDIR/mastracode"
cd "$WORKDIR/mastracode"
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.version="0.4.0-superset.2";fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n");'
npm pack
```

2. Publish tarball to fork release:

```bash
gh release create mastracode-v0.4.0-superset.2 ./mastracode-0.4.0-superset.2.tgz \
  -R superset-sh/mastra \
  --title "mastracode v0.4.0-superset.2" \
  --notes "Superset internal mastracode bundle"
```

3. Update root `package.json` `resolutions.mastracode` URL to the new release asset.

4. Run install:

```bash
bun install
```

5. Verify lockfile points to the release URL:

```bash
rg -n "mastracode-v0.4.0-superset.2|mastracode@https://github.com/superset-sh/mastra/releases/download" bun.lock package.json
```
