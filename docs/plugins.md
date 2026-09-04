# Plugins

A plugin is a bundle of skills and MCP tools an agent can use, installed per user account and
materialized onto every machine that account signs into. First-party ones live in `plugins/<name>/`
and are listed in `.agent-marketplace.json` at the repo root.

## What is source and what is generated

Only three things in a plugin directory are hand-written:

| Path | Owner |
| --- | --- |
| `plugins/<name>/plugin.json` | you |
| `plugins/<name>/skills/*/SKILL.md` | you |
| `plugins/<name>/src/index.ts` | you (optional MCP server) |
| `plugins/<name>/server/` | `superset plugins build` (committed: it is what a release ships) |
| `.agent-marketplace.json` | `superset plugins create` / `publish` |
| `packages/shared/src/plugins/manifests.generated.ts` | `superset plugins publish` |

`manifests.generated.ts` is generated; editing it by hand is the one way to get a marketplace that
disagrees with itself. It exists because the API must resolve `token_url` and the proxy target
*without* trusting anything client-supplied; a manifest posted in a request would be an
exfiltration path.

**A release is a git tag, not a folder.** `<name>@<version>` on the marketplace repo is the version:
`plugins install` fetches that tag and takes the plugin's tree at it, and the generated manifest
pins a bundled server by `path` + `ref` + `integrity`, so the bytes a host downloads belong to the
version rather than to whatever the branch holds now. A `path:` marketplace has no releases in it
and installs the working tree, which is what makes local authoring work.

## Changing a plugin

```bash
superset plugins publish <name> --bump patch   # rewrites the marketplace entry and the bundle
git commit -am "publish <name>@<version>"
git tag <name>@<version> && git push --tags    # the tag is the release
bun run check:plugins                          # what CI runs; catches a change that skipped publish
```

`check:plugins` fails on a marketplace entry whose version disagrees with `plugin.json`, a `server/`
build that is stale against `src/`, a `manifests.generated.ts` that a publish would rewrite, and a
tag whose tree no longer matches the working tree — which is how an edit that skipped publish gets
caught. An unreleased version has no tag yet and is not an error.

Bump the version rather than moving a tag: a tag someone's account is pinned to is the one thing
that must not change under them.

## Manifest shape

`plugin.json` follows the Codex plugin vocabulary — `name`, `version`, `description`, `author`,
`license` — with everything Superset-specific under `extensions.superset`:

- `interface` — `displayName`, `category` (one of `PLUGIN_CATEGORIES` in
  `packages/shared/src/plugins/index.ts`), and `icon`.
- `auth` — an array of methods, each `oauth2` or `api_key`. OAuth entries carry
  `authorization_url`, `token_url`, `scopes`, `requires_env` (the client id/secret env names the API
  reads — name the service's pair, not the plugin's, so two plugins for one service share one
  registered OAuth app; only `PLUGIN_<SERVICE>_CLIENT_ID`/`_SECRET` may be named), an `identity`
  probe that names the connected account, and `bind`, which says how the
  credential is attached to outbound calls. `${config.access_token}` and `${inputs.<name>}`
  placeholders are resolved server-side by `apps/api/src/lib/plugins/manifest.ts`.
- `mcpServers` — server name → config, the same shape as an `.mcp.json` value. The name lands
  verbatim as a config key in agent CLIs.

Credentials never reach the manifest, the renderer, or the agent's machine. They are encrypted at
rest with `BETTER_AUTH_SECRET` (`apps/api/src/lib/plugins/crypto.ts`) and attached by the proxy in
`apps/api/src/lib/plugins/dispatch.ts`, so a tool call goes out from the API, not from the agent.

## Install state on a machine

One file, `$SUPERSET_HOME_DIR/plugins/installed_plugins.json`, records what is materialized. Note
`SUPERSET_HOME_DIR` — `SUPERSET_HOME` is the CLI installer's prefix (see
`apps/marketing/public/cli/install.sh`) and names nothing here.

Every provisioner reads that file: the desktop at boot, `superset plugins sync`, the host-service.
That is deliberate. Provisioning is *declarative* — `createManagedSkills` in `@superset/agent-setup`
writes the desired set and reaps whatever is absent, so a caller that hands in its own plugin list
instead of letting agent-setup read the file has just told it every other caller's plugins are gone.
The desktop's next boot would undo a `plugins sync`, and vice versa.

Skills land in `~/.agents/skills` (what Codex, Vibe, and Kimi read natively) and are mirrored into
`~/.claude/skills` as a plugin directory, because Claude does not read the shared convention.

## Command surface

```
superset plugins create|build|validate|publish  # authoring
superset plugins install|uninstall|list|sync    # this machine
superset plugins enable|disable <name>          # without dropping its skills
superset plugins connect|connections            # credentials
superset plugins marketplace list|add|remove    # marketplace sources
superset mcp tools|call-tool                    # call a plugin's tools through the proxy
superset skills list
```
