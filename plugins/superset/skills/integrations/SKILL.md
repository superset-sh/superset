---
name: integrations
description: Discover and call the tools a connected integration exposes, such as Linear, GitHub, Sentry, or Notion, through `superset mcp`. Use when the user wants something done in a connected service, asks what an integration can do or which tools it has, wants a specific tool called, asks why an integration's tools are failing, or when another skill expects `mcp__linear__*`-style tools that are not in your tool list.
argument-hint: what you want done in a connected service
allowed-tools: Bash(superset mcp:*) Bash(superset plugins:*) Bash(superset skills:*)
---

# Calling an integration's tools

An integration is an installed plugin with a connected account. Its tools do not run here.
`superset mcp` hands the call to Superset's API, which attaches the stored credential and
forwards it to the plugin's MCP server. No token is ever written to this machine, which is
also why a sandbox with no route to Linear can still file a Linear issue.

Installing, connecting, and marketplaces belong to the `plugins` skill. This one starts once
something is connected, and it is two steps: list the tools, then call one.

## 1. Find the integration

```bash
superset plugins list                     # one row per connected account, one row if none yet
superset plugins connections --plugin linear
```

Read the `STATUS` column. `connected: <account>` is callable. `needs connection` means the
skills are installed but no account is authorized, so its tools will fail until someone
connects one; that is a connect step, not a bug. `PLUGIN ID` holds the connection id, and it
is empty on a row with no connection yet. A plugin with two connected accounts has two rows
and two ids.

## 2. List the tools before calling one

```bash
superset mcp tools linear
superset mcp tools --connection <id>              # when the name has several accounts
superset mcp tools linear | jq -r '.[].tool'      # names only; descriptions run long
```

Names and descriptions come from the plugin's own server, not from anything in this repo, and
they change between plugin versions. Never call a tool you have not listed.

The listing gives a name and a description, but **no input schema**. The description is where
the plugin documents its arguments, so read the full description of the tool you are about to
call rather than the filtered name list. If the shape is still ambiguous, a wrong call comes
back as a tool error naming the offending field; correct it from there.

## 3. Call it

```bash
superset mcp call-tool linear list_issues
superset mcp call-tool linear create_issue '{"team":"ENG","title":"Export 500s"}'
echo '{"team":"ENG","title":"..."}' | superset mcp call-tool linear create_issue -
superset mcp call-tool linear create_issue --connection <id> '{"team":"ENG","title":"..."}'
```

The plugin name is the first positional and the tool name the second, always. `--connection`
picks the account; it does not stand in for the plugin positional. Arguments are the third
positional, default `{}`, and `-` reads them from stdin. Use stdin for anything secret, since
an argument is visible in `ps` and in shell history.

What comes back is the MCP result verbatim: a `content` array whose text parts are usually
themselves JSON strings.

```bash
superset mcp call-tool linear list_issues | jq -r '.content[0].text' | jq
```

## When another skill expects tools you do not have

A plugin ships its own skills, and they are written against native MCP tools: the Linear,
GitHub, and Sentry skills declare `allowed-tools: mcp__linear__*` and reach for tools by that
name. Those tools exist only where the plugin's MCP server was written into this agent's
config, which installing through the CLI does not do, and which today happens for Claude Code
and Codex only. On every other agent the tool list will not have them.

That is this skill's job. When the tools a plugin's skill assumes are missing, do not stop and
do not tell the user the integration is unavailable. The same operations sit on the connected
account, one command away:

```bash
superset mcp tools linear                       # what the account can actually do
superset mcp call-tool linear create_issue '{"team":"ENG","title":"..."}'
```

Keep following the skill you were reading, since its judgment about what makes a good issue or
a good triage still applies. Only the transport changes.

## Reading a failure

| What you see | What it means |
| --- | --- |
| `"x" is not connected. Connect an account first.` | Nothing is authorized under that name. Also what an uninstalled plugin looks like. Run `superset plugins connect x`, or install it first. |
| `"x" has N connected accounts; choose one:` | The CLI refuses to guess and prints a `--connection <id>` line per account. Ask the user which account, do not take the first. |
| `Name a plugin, or pass --connection <id>.` | `superset mcp tools` with no target. |
| `Missing required argument: <tool>` | `call-tool` takes the plugin, then the tool. |
| `Arguments must be JSON: ...` | The third positional is a JSON object, quoted as one shell word. |
| 401 or 403 from the tool itself | Read the error before acting. Reconnect only when it names an invalid, revoked, or expired credential. A 403 that names a scope, a permission, or a resource means the connected account lacks that access, and reconnecting the same account changes nothing. |
| `needs connection` in `plugins list` | Installed, unauthorized. Nothing you pass to `mcp` fixes this. |

## Anti-patterns

- Calling a tool without listing tools first. You are guessing at a name and a schema the
  plugin owns.
- `--plugin-id`. Deprecated alias for `--connection`.
- Passing a credential as a command argument when the command reads stdin.
- Picking one of several connected accounts yourself. Which account acts is the user's call.
- Reconnecting on any 403. Half of them are a permissions problem on the account you already
  have.
- Reaching for `superset plugins sync` when a call fails on authorization. Sync converges
  skills on this machine; it has nothing to do with credentials.
- Installing or connecting a plugin to see what it offers. That writes to the user's account
  and reaches every machine they sign in on, so ask first and use the `plugins` skill.
