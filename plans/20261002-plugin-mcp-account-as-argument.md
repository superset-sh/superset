# One MCP server per plugin, the account as a tool argument

Fast follow to #8003 (`aged-hoodie-adfa02ee`). Written 2026-10-02.

## Intent

An agent reaches a plugin through one MCP config entry per plugin, and that
entry's name never changes. When the caller holds two or more live connections
on the plugin's connector, the proxy advertises a required `superset_account`
argument on every tool and resolves the account per call. No machine keeps a
list of accounts.

This replaces the per-account config entries (`gmail-work`, `gmail-personal`)
that #8003 introduces. With one account, every byte an agent sees is what it
sees today.

## Why this shape

- **The server name is stable.** An agent's approvals and allowlists are keyed
  on `mcp__gmail__send_email`. #8003's own comment in `pluginProxyMcpServers`
  states the cost of the alternative: a rename "orphans the token the agent
  stored against the old name". Connecting a second account, or renaming one,
  must not reset what the user has already approved.
- **One tool list, not one per account.** Two Linear workspaces plus two Gmail
  accounts is roughly 120 tool definitions as separate servers. Here it is the
  same list with one more argument.
- **Nothing per machine.** `desiredMcpServers`
  (`apps/desktop/src/main/lib/plugin-installs.ts:76`) is built from the static
  plugin catalog with no network at boot. Per-account entry *names* cannot come
  from there, which is why #8003 had to add a cached account list, a CLI
  refresh, and a renderer push. The proxy reads the account list per request,
  where it is always current.
- **The 1 to 2 transition fails readably.** Today a second account makes
  `activeConnection` throw `AmbiguousConnectionError`, which
  `apps/api/src/app/mcp/plugins/[marketplace]/[plugin]/route.ts` maps to HTTP
  409 — a transport failure, on `tools/list` as well, so the plugin is simply
  down. An `isError` tool result instead tells the model what to pass, and it
  can retry in the same turn.

## Decisions

1. **Branch stacks on #8003.** A second PR targets `aged-hoodie-adfa02ee` and
   rebases onto `main` once that merges. #8003 ships the event-routing half on
   its own schedule, and the two diffs stay separately reviewable.
2. **Automation and Slack runs pin, they do not choose.** A run passes its
   trigger's `connection_id` as `?connection=`, so the argument never appears
   and the run cannot cross accounts. A trigger with no pin falls back to the
   agent choosing.
3. **One approval spans every account on the connector.** Accepted: approving
   `send_email` once covers both mailboxes. The acting account is echoed in the
   tool result text and in `_meta.superset_account`, so the transcript records
   which mailbox acted.

## Architecture

### Target resolution

`resolveTarget` (`packages/trpc/src/router/plugins/proxy/resolve-target.ts`)
gains a fourth `PluginTarget` kind:

```ts
| {
    kind: "multi";
    connector: string;
    accounts: AccountRef[];               // connectionId, nickname, label, needsReauth
    resolve(connectionId: string): Promise<PluginTarget>;
  }
```

It is entered only when `request.connectionId` is absent **and** the connector
has two or more live rows for the caller. One row returns today's target
unchanged. `?connection=<id>` returns today's pinned target unchanged.

The multi branch must list rows *before* the lookup that throws:
`activeConnection` goes through `userConnection`
(`packages/trpc/src/lib/connectors/lookup.ts:74`), which does `limit(2)` and
then `single()`. So the branch uses a listing lookup scoped to (organization,
connector, `connectedByUserId`, live) and only calls the single-row path when
the count is one.

`AmbiguousConnectionError` stays — `packages/trpc/src/router/plugins/plugins.ts:42`
still uses it — and the route's 409 branch stays as a backstop.

### tools/list

`buildPluginServer` gains a `multiServer(target)` beside the three it has:

- Read the tool list from one live account: newest live row, skipping any that
  needs reauth. Remote goes through `upstreamTools`, first-party through
  `build.getTools()`.
- Inject `superset_account` into each tool's `inputSchema.properties`: a string
  with an `enum` of the connection ids, and a description carrying each id's
  nickname and identity.
- Append it to `required`.
- Build the `Server` with `instructions` naming the accounts.

Four edge cases, each a test:

- A tool with no `properties` block gets one.
- `additionalProperties: false` upstream is harmless — the proxy strips the
  argument before forwarding.
- **Name collision.** If any listed tool already defines `superset_account`,
  the injected name becomes `superset_account_id` for *every* tool on that
  server. The name is chosen once per server, never per tool, so the model
  never sees two spellings.
- A tool list read from an account that expires between list and call: the call
  resolves its own row, so this is already covered by the call path.

`upstreamTools`' cache is keyed `connectionId:plugin`
(`proxy/upstream-catalog.ts`), and injection happens after the cache read, so
the cache keeps holding unmodified vendor lists.

### tools/call

1. Read `superset_account`. Missing or not in the live set returns `isError`
   with the choices. Validation also accepts a nickname, so a model that writes
   `"personal"` does not burn a turn — the enum still advertises ids only.
2. `target.resolve(connectionId)` returns today's remote or first-party target,
   `ensureFreshConnection` included. A row that cannot refresh returns `isError`
   carrying that row's reconnect link — built by the existing `connectUrl()`,
   not hand-written, so api-key and OAuth connectors each get their own shape.
   The other account keeps working.
3. Delete the argument from `arguments` and forward through the existing
   per-call `upstreamClient`.
4. On success, name the acting account in the result text and set
   `_meta.superset_account`.

First-party servers need one move: `FirstPartyServer.callTool(name, args,
credential)` already takes the credential per call
(`packages/trpc/src/router/plugins/servers/index.ts:11`), but
`plugin-server.ts:46` builds it in the server's closure. It moves into the call
handler so it is built from the chosen row.

### Automation and Slack-triggered runs

`openSession` (`apps/api/src/app/api/integrations/slack/events/utils/run-agent/plugin-tools.ts:55`)
resolves with no connection id and handles only `needs-auth`. Per decision 2 it
takes the trigger's `connectionId` (`automationTriggers.connectionId`, added by
#8003) and passes it as `request.connectionId`.

Its `cacheKey` reads `target.connectionId`, which a multi target has no single
value for. For the unpinned fallback the key becomes `plugin@version` plus the
sorted account set. This path's tool-list TTL is an hour, so a stale list
without the argument outlives any desktop session — which is why the `isError`
path matters more here than anywhere else.

### Config writers: what is removed

From #8003:

- `pluginProxyMcpServers`' `connections` option and `accountSegments`
  (`packages/shared/src/plugins/index.ts`) — back to one entry per plugin. The
  `headersHelper` option stays.
- `readPluginConnections`, `writePluginConnections`,
  `pluginConnectionsFilePath` (`packages/agent-setup/src/plugin-connections.ts`).
  `mcpHeadersHelperCommand` stays and is all that file keeps.
- `plugins.syncConnections` (`apps/desktop/src/lib/trpc/routers/plugins/index.ts`)
  and the `PluginConnectionsSync` renderer component. `syncInstalledPluginMcpServers`
  loses its connections parameter.
- `refreshPluginConnectionsCache` and its call sites in `plugins install`,
  `plugins sync` and `plugins connect` (`packages/cli/src/lib/plugins/mcp-servers.ts`).
- The `connections:` argument at the host-service call site
  (`packages/host-service/src/runtime/agent-provisioning.ts`).
- `PluginConnectionRef`, if nothing else reads it.

Kept, because none of it is about naming: `superset auth mcp-headers`;
`reconcileMcpServers`, which exists because an install made on the web, from
the CLI, or on a cloud box never reaches the desktop process that writes agent
config; the Claude project-scope fix; CLI `--account`; `?connection=`; the
`connections.nickname` column and rename.

`plugins.syncConnections` is an unreleased procedure on an unmerged branch, so
removing it is not a tRPC compatibility event. Confirm that before deleting it.

## Error contract

Three shapes, all tool results the model can act on rather than transport
failures:

```jsonc
// no argument — typical right after a second account connects
{ "isError": true, "content": [{ "type": "text",
  "text": "Gmail has 2 accounts; pass superset_account. work = 3acd5c10…, personal = 11111111…" }] }

// an id that is not one of the caller's live accounts
{ "isError": true, "content": [{ "type": "text",
  "text": "superset_account 9999… is not a connected Gmail account. Valid: 3acd5c10… (work), 11111111… (personal)." }] }

// the chosen account expired; the other keeps working
{ "isError": true, "content": [{ "type": "text",
  "text": "satya…@gmail.com needs to be reconnected. Ask the user to open <connectUrl(connector)> then retry." }] }
```

## Testing

- Schema injection: no `properties` block, `additionalProperties: false`,
  the name collision, `required` appended, the account chosen for listing.
- Argument validation: missing, unknown, nickname accepted, expired row.
- `resolveTarget`: one row unchanged, two rows multi, `?connection=` pinned,
  every row expired returns `needs-auth`.
- `desiredPluginMcpServers` emits one entry per plugin whatever the connection
  count. This replaces #8003's per-account naming tests rather than extending
  them; `packages/cli/src/lib/plugins/mcp-servers.test.ts` and
  `resolve-target.test.ts` both need rewriting.
- Integration: an in-memory client against `buildPluginServer` for a
  two-account first-party server — list, call as each account, assert the
  forwarded arguments carry no `superset_account` and `_meta` names the right id.
- `bun run check:i18n` and `check:plugins` per the repo's pre-push checks. The
  error strings are agent-facing tool results, not UI, so they stay untranslated.

## Risks

- **A running session keeps calling without the argument until it restarts.**
  The proxy is stateless and cannot send `list_changed`. The `isError` text is
  the answer. Per-account entries have the same wrinkle — the old entry's URL
  stops resolving the moment it is rewritten.
- **`instructions` is weak.** It is delivered once at `initialize` and clients
  differ in whether they surface it. The enum's description is the load-bearing
  channel; treat `instructions` as a bonus.
- **The model must copy a UUID.** The enum constrains it and the description
  maps nicknames to ids. Accepting a nickname in validation covers the rest.
- **One approval spans both accounts** (decision 3), recorded in the result and
  `_meta` rather than prevented.

## Out of scope

Per-account approval granularity. The "second login into the same workspace
silently overwrites the first" bug #8003 notes as pre-existing. Anything in the
event-routing half of #8003.
