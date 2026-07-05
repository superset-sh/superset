---
description: Manage a single Superset automation — edit its prompt in $EDITOR, view recent runs, or trigger a one-off run.
argument-hint: <id-or-slug> [edit | logs | run] (default: edit)
allowed-tools: Bash(superset:*), Bash(mktemp:*), Bash(${EDITOR}:*), Bash(${VISUAL}:*), Bash(vi:*), Bash(vim:*), Bash(nano:*), Bash(jq:*), AskUserQuestion
---

You are operating on a single Superset automation.

## Parse arguments

Take `$ARGUMENTS` as `<id-or-slug> [action]`.

- If `<id-or-slug>` is missing, ask the user via `AskUserQuestion`. Optionally call `superset automations list --json | jq -r '.[] | "\(.slug)\t\(.name)"'` and present recent automations as choices.
- If `[action]` is missing, default to `edit`.

The CLI is required for all actions below — there's no MCP equivalent for the editor round-trip, and the run/logs flows benefit from CLI's argument parsing. If `superset` isn't on PATH, tell the user to install it: `curl -fsSL https://superset.sh/cli/install.sh | sh`.

## Dispatch

### `edit` — round-trip the prompt body via $EDITOR

```bash
ID="<id-or-slug>"
TMP=$(mktemp -t superset-prompt.XXXXXX.md)
superset automations prompt get "$ID" > "$TMP"
${EDITOR:-${VISUAL:-vi}} "$TMP"

if [ ! -s "$TMP" ]; then
  echo "Empty prompt — refusing to write."
  rm -f "$TMP"
  exit 1
fi

superset automations prompt set "$ID" --from-file "$TMP"
rm -f "$TMP"
```

`prompt get | prompt set` round-trips byte-exact, so this is safe to scripts/edits without trailing-newline drift. The CLI also refuses an empty prompt server-side as a backstop.

### `logs` — show recent runs

```bash
superset automations logs "<id-or-slug>" --limit 20 --json
```

Render as a table: RUN ID, STATUS, SCHEDULED, DISPATCHED, HOST. Statuses to know:
- `dispatched` — handed off to the target host successfully
- `skipped_offline` — host wasn't online at fire time
- `dispatch_failed` — handoff broke; check the error field

### `run` — one-off run now

```bash
superset automations run "<id-or-slug>" --json
```

Print the new run id and tell the user to use `/superset-automation <id> logs` (or just ask) to inspect the result.

## Report

After any action, print a one-line summary of what changed and the automation's id/slug.
