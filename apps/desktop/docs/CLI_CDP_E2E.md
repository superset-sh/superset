# CLI to desktop CDP end-to-end testing

Use this runbook when a CLI change must be verified against the real Electron
app. `bun run test:cli-e2e` is the isolated, renderer-free acceptance suite;
this workflow uses the development CLI against Electron's real host service and
then verifies the returned state in the renderer through CDP.

There is no CLI `--test` flag. Run every command from the worktree under test,
use its provisioned `SUPERSET_HOME_DIR`, and never point this workflow at
production or the default `~/.superset` directory.

## Start and identify the app

Confirm the worktree's generated ports and home without sourcing `.env`:

```bash
pwd
awk -F= '/^(DESKTOP_VITE_PORT|SUPERSET_HOME_DIR|NEXT_PUBLIC_API_URL)=/ { print $1 "=" $2 }' .env
```

Choose an unused CDP port and launch the full stack in terminal A. A
renderer-only Vite process does not own the host service or PTY daemon and is
not an end-to-end target. Root `bun dev` rebuilds the CLI before Electron
launches and installs that binary at `<SUPERSET_HOME_DIR>/bin/superset`.

```bash
cdp_port=29422
lsof -nP -iTCP:"$cdp_port" -sTCP:LISTEN
RENDERER_REMOTE_DEBUG_PORT="$cdp_port" bun dev
```

In terminal B, require a `page` target whose URL uses this worktree's renderer
port. A responding CDP endpoint by itself is insufficient.

```bash
cdp_port=29422
desktop_port=$(awk -F= '/^DESKTOP_VITE_PORT=/{ gsub(/"/, "", $2); print $2 }' .env)
curl -fsS "http://127.0.0.1:$cdp_port/json/list" \
  | jq --arg origin "http://localhost:$desktop_port/" \
    '[.[] | select(.type == "page" and (.url | startswith($origin))) | {title, url, webSocketDebuggerUrl}]'
ps -axo pid=,ppid=,command= | rg "$PWD|remote-debugging-port=$cdp_port"
```

Verify the renderer session using the cookie or in-memory bearer flow in
`apps/desktop/AGENTS.md`. Never print a token, host secret, config file, or
manifest. If local state is missing, use the applicable setup script without
`--force`.

## Run the CLI against Electron's host

First prove the development CLI sees the live host manifest written beneath
this worktree's `SUPERSET_HOME_DIR`:

```bash
dev_home=$(awk -F= '/^SUPERSET_HOME_DIR=/{ gsub(/"/, "", $2); print $2 }' .env)
test -x "$dev_home/bin/superset"

case_id="cli-cdp-$(date +%s)"
evidence_dir="test-results/cli-cdp/$case_id"
mkdir -p "$evidence_dir"

SUPERSET_HOME_DIR="$dev_home" "$dev_home/bin/superset" --json status \
  > "$evidence_dir/cli-status.json"
jq '{running, healthy, organizationId, hostId, port}' \
  "$evidence_dir/cli-status.json"
```

Use the same explicit `SUPERSET_HOME_DIR="$dev_home"` prefix for every bundled
CLI command and for any Bun/TypeScript evidence harness that imports CLI config
helpers. Setting it only on a spawned child can select one organization in the
harness and another in the CLI. `bun run --cwd packages/cli dev -- ...` is
useful for source-level iteration because its script loads the worktree `.env`;
the bundled path above is the correct check for the CLI used by terminals
opened from this `bun dev` app.

Stop if `running` or `healthy` is not true. Then create an unambiguous fixture
and retain the command's stdout, stderr, and exit code:

```bash
project_id=$(bun run --cwd packages/cli dev -- --json projects list --local \
  | jq -r '[.[] | select(.setUp == "yes")][0].id')
test -n "$project_id" && test "$project_id" != "null"

if bun run --cwd packages/cli dev -- --json workspaces create \
  --local --project "$project_id" --name "$case_id" --branch "$case_id" \
  --agent codex --prompt "Report this test id: $case_id" \
  > "$evidence_dir/workspace-create.json" \
  2> "$evidence_dir/workspace-create.stderr"; then
  cli_exit=0
else
  cli_exit=$?
fi
printf '%s\n' "$cli_exit" > "$evidence_dir/workspace-create.exit-code"
test "$cli_exit" -eq 0

workspace_id=$(jq -r '.workspace.id' "$evidence_dir/workspace-create.json")
session_id=$(jq -r '.agents[] | select(.ok and .kind == "terminal") | .sessionId' \
  "$evidence_dir/workspace-create.json")
test -n "$workspace_id" && test "$workspace_id" != "null"
test -n "$session_id" && test "$session_id" != "null"

bun run --cwd packages/cli dev -- --json agents sessions read \
  "$session_id" --local --lines 120 > "$evidence_dir/session-read.json"
printf 'Continue and report the same test id.\n' \
  | bun run --cwd packages/cli dev -- --json agents sessions send \
      "$session_id" --local --wait --timeout 5m \
      > "$evidence_dir/session-send.json"
```

Use an agent configured on the target host if `codex` is unavailable.

## Verify and capture through CDP

Tie the renderer evidence to the exact returned IDs:

1. Wait for `$case_id` to appear in the sidebar.
2. Navigate with real UI input. `Runtime.evaluate` may locate a bounding box,
   but activate it with `Input.dispatchMouseEvent`, not `element.click()` or a
   store mutation.
3. Open or deep-link the returned workspace and terminal. On macOS:

   ```bash
   open "superset://v2-workspace/$workspace_id?terminalId=$session_id&focusRequestId=$(date +%s)"
   ```

4. Record `window.location.href`, the visible workspace/session identifiers,
   and focused state through CDP.
5. Capture the visible result with `Page.captureScreenshot`.

`apps/desktop/scripts/cdp-smoke-integrations.ts` demonstrates selecting the
correct renderer and sending CDP commands over its `webSocketDebuggerUrl`.

A complete `test-results/cli-cdp/<case-id>/` result contains the commit and
worktree, renderer URL and CDP port, CLI exit/stdout/stderr, returned IDs,
machine-readable CDP assertions, and a genuine screenshot. CLI output proves
the command path; the screenshot proves the real renderer displayed that same
state. Neither substitutes for the other.

### Sidebar group acceptance flow

For sidebar work, the screenshot must show a user-created group by its unique
name and the workspace nested beneath it. Project collapse/expand is not group
evidence.

```bash
group_name="group-$case_id"
bun run --cwd packages/cli dev -- sidebar groups create "$group_name" \
  --project "$project_id" > "$evidence_dir/group-create.txt"
bun run --cwd packages/cli dev -- sidebar move "$workspace_id" \
  --group "$group_name" > "$evidence_dir/group-move.txt"
bun run --cwd packages/cli dev -- --json sidebar list \
  > "$evidence_dir/sidebar-list.json"
```

Capture the expanded group containing the workspace, then run `sidebar groups
collapse`, capture the visibly collapsed group, and run `sidebar groups expand`
before rename/delete cleanup. Save each CLI result separately. A CLI exit code
of zero is valid only after the renderer has acknowledged the mutation.

Clean up only the fixture created by this run:

```bash
bun run --cwd packages/cli dev -- --json workspaces delete \
  "$workspace_id" --local > "$evidence_dir/workspace-delete.json"
```
