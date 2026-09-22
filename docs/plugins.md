# Plugins

A plugin is a bundle of skills and MCP tools an agent can use, installed per user account and
materialized onto every machine that account signs into. First-party ones live in `plugins/<name>/`
and are listed in `.agent-marketplace.json` at the repo root.

## What is source and what is generated

Only two things in a plugin directory are hand-written:

| Path | Owner |
| --- | --- |
| `plugins/<name>/plugin.json` | you |
| `plugins/<name>/skills/*/SKILL.md` | you |
| `.agent-marketplace.json` | `superset plugins create` / `publish` |
| `packages/shared/src/plugins/manifests.generated.ts` | `superset plugins publish` |

A plugin ships no code. Tools come either from the vendor's own MCP server, which Superset proxies
to, or from a server Superset hosts itself for the handful of plugins whose vendor publishes none
(`SUPERSET_HOSTED_PLUGINS` in `packages/shared/src/plugins/index.ts`, implemented under
`packages/trpc/src/router/plugins/servers/`). Hosted tools ship on an API deploy, not a plugin tag.

`manifests.generated.ts` is generated; editing it by hand is the one way to get a marketplace that
disagrees with itself. It exists because the API must resolve `token_url` and the proxy target
*without* trusting anything client-supplied; a manifest posted in a request would be an
exfiltration path.

**A release is a git tag, not a folder.** `<name>@<version>` on the marketplace repo is the version:
`plugins install` fetches that tag and takes the plugin's skills at it, so what a host installs
belongs to the version rather than to whatever the branch holds now. A `path:` marketplace has no releases in it
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
- `connector` — the one connection this plugin needs, as `{ "slug" }`. A slug names a connector in
  `packages/shared/src/connectors/connectors.json`; the manifest carries no OAuth configuration of
  its own — no scopes, no client mode, no `requires_env`. A connection is account state, and the
  connections system already owns obtaining, refreshing and disconnecting it, so naming one is all
  a plugin does. Omit it for a plugin whose tools need no connection.
- `bind` — how the connection's credential is attached to outbound calls.
  `${config.access_token}` and `${inputs.<name>}` placeholders are resolved server-side by
  `packages/trpc/src/router/plugins/manifest.ts`.
- `mcp` — the vendor's own MCP server (`type: "streamable-http"`, `url`, optional `headers`), not a
  map: a plugin serves tools from exactly one place. Omit it for a Superset-hosted plugin.

The published JSON Schema at `https://superset.sh/schemas/plugin/1.0.0.json` is generated from
`pluginManifestSchema` in `packages/shared/src/plugins/manifest-schema.ts`, and
`superset plugins publish` validates against that same definition — so the schema we serve and the
schema we enforce cannot drift.

### Where a connection comes from

How a connector obtains its connection is the connections system's decision, not a manifest field.
A connector either names a pre-registered client through `requires_env` in `connectors.json`, or
declares `"client": "dynamic"` and takes both endpoints and client identity from the MCP server at
connect time: the API reads `/.well-known/oauth-protected-resource`, follows it to the
authorization server's metadata, and then gets a client identity one of two ways:

- the server advertises `client_id_metadata_document_supported`, so the client id is the URL of a
  document we host at `/api/connectors/<connector>/client-metadata` — nothing is registered or
  stored; or
- the server offers a `registration_endpoint`, so we register once per authorization server
  (RFC 7591) and keep the result in `plugin_oauth_clients`, keyed by issuer and redirect URI so
  every user shares one registration.

Either way the flow is PKCE with a `resource` indicator, the authorization response's `iss` is
checked against the discovered issuer before the code is redeemed (RFC 9207), and refresh happens
before a tool call. This is what lets a hosted MCP server be installable without anyone registering an
OAuth app first.

Credentials never reach the manifest, the renderer, or the agent's machine. They are sealed at rest
by `packages/trpc/src/lib/secret-box.ts` under `SECRETS_ENCRYPTION_KEY` and attached by the proxy in
`packages/trpc/src/router/plugins/proxy/`, so a tool call goes out from the API, not from the
agent.

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
