# CLI to desktop CDP end-to-end testing

Use this runbook when a CLI change must be verified in the real Electron app.
This is a different test boundary from `bun run test:cli-e2e`:

- `bun run test:cli-e2e` is the deterministic, isolated, renderer-free CLI
  acceptance suite.
- CLI-to-CDP testing runs the development CLI against the host service started
  by a full Electron development app, then verifies the renderer's visible
  response through Chrome DevTools Protocol (CDP).

There is no special CLI `--test` flag. The development CLI is the test client.
It must load the same root `.env`, `SUPERSET_HOME_DIR`, organization config, and
host manifest as the Electron instance under test.

## Safety and prerequisites

Run every command from the exact worktree being tested.

- Use that worktree's per-worktree `superset-dev-data` and local development
  database. Never point this workflow at production data or the default
  `~/.superset` directory.
- Use the full `bun dev` stack. `electron-vite --rendererOnly` is not an
  end-to-end app: it has no Electron main process coordinating the real host
  service and PTY daemon.
- Choose an unused CDP port. Never assume a responding port belongs to this
  worktree.
- Do not print auth tokens, host-service secrets, attachment contents, or the
  contents of `superset-dev-data/config.json` or a host manifest.
- If `.env` or local state has not been provisioned, run the applicable
  `.superset/setup*.sh` script without `--force`. Follow the auth repair rules in
  `apps/desktop/AGENTS.md`; do not use setup `--force` to repair a cookie or
  stale cache.

Confirm that the root `.env` has this worktree's values without sourcing it:

```bash
pwd
awk -F= '/^(DESKTOP_VITE_PORT|SUPERSET_HOME_DIR|NEXT_PUBLIC_API_URL)=/ { print $1 "=" $2 }' .env
```

`SUPERSET_HOME_DIR` should resolve inside the current worktree, normally to
`superset-dev-data`.

## 1. Launch the real app with CDP

In terminal A, choose an unused port and start the full stack:

```bash
cdp_port=29422
lsof -nP -iTCP:"$cdp_port" -sTCP:LISTEN
RENDERER_REMOTE_DEBUG_PORT="$cdp_port" bun dev
```

The `lsof` command should produce no listener before launch. Keep this process
running for the entire test.

Do not replace this command with a separately launched Vite renderer. Electron
must start the host service so it writes the shared manifest at:

```text
$SUPERSET_HOME_DIR/host/<organization-id>/manifest.json
```

The CLI uses that manifest to address the same loopback host service as the
desktop app.

## 2. Prove the CDP target belongs to this worktree

In terminal B, set the same CDP port and read the renderer port from `.env`:

```bash
cdp_port=29422
desktop_port=$(awk -F= '/^DESKTOP_VITE_PORT=/{ gsub(/"/, "", $2); print $2 }' .env)

lsof -nP -iTCP:"$cdp_port" -sTCP:LISTEN
curl -fsS "http://127.0.0.1:$cdp_port/json/list" \
  | jq --arg origin "http://localhost:$desktop_port/" \
    '[.[] | select(.type == "page" and (.url | startswith($origin))) | {id, title, url, webSocketDebuggerUrl}]'
```

Require exactly the intended app `page` target. Also inspect the owning Electron
process when multiple worktrees are running:

```bash
ps -axo pid=,ppid=,command= \
  | rg "$PWD|remote-debugging-port=$cdp_port"
```

A healthy `/json/list` response alone is not proof. Record the worktree path,
CDP port, renderer port, target URL, and current route in the test artifacts.

## 3. Verify renderer auth and the real host service

Verify `/api/auth/get-session` from inside the matched renderer before driving
the test. Use the cookie or in-memory bearer flow described in
`apps/desktop/AGENTS.md`; never extract or print the bearer token.

Then verify the development CLI resolves the same organization and live host:

```bash
case_id="cli-cdp-$(date +%s)"
evidence_dir="test-results/cli-cdp/$case_id"
mkdir -p "$evidence_dir"

bun run --cwd packages/cli dev -- --json status \
  > "$evidence_dir/cli-status.json"
jq '{running, healthy, organizationId, hostId, port}' \
  "$evidence_dir/cli-status.json"
```

Require `running: true` and `healthy: true`. If the CLI reports a missing or
stale manifest, stop: the CLI and renderer are not using the same app state.
If it reports `Not logged in`, authenticate the development CLI against the API
configured in this worktree; do not copy a token out of the renderer.

The package's `dev` script loads the root `.env`. Do not override
`SUPERSET_HOME_DIR` with a temporary harness directory for this workflow; that
would intentionally disconnect the CLI from the Electron-owned host.

## 4. Run the CLI journey

Use a unique name so the resulting row is unambiguous in the renderer. This
example exercises workspace creation, a real attachment upload, and inline
agent launch:

```bash
project_id=$(bun run --cwd packages/cli dev -- --json projects list --local \
  | jq -r '[.[] | select(.setUp == "yes")][0].id')
test -n "$project_id" && test "$project_id" != "null"

attachment_path=$(mktemp "${TMPDIR:-/tmp}/superset-cli-cdp.XXXXXX")
printf '# CLI CDP fixture\n\ncase=%s\n' "$case_id" > "$attachment_path"

if bun run --cwd packages/cli dev -- --json workspaces create \
  --local \
  --project "$project_id" \
  --name "$case_id" \
  --branch "$case_id" \
  --agent codex \
  --prompt "Read the attachment and report its exact case= line, then wait." \
  --attachment "$attachment_path" \
  > "$evidence_dir/workspace-create.json" \
  2> "$evidence_dir/workspace-create.stderr"; then
  cli_exit=0
else
  cli_exit=$?
fi
printf '%s\n' "$cli_exit" > "$evidence_dir/workspace-create.exit-code"
test "$cli_exit" -eq 0

workspace_id=$(jq -r '.workspace.id' "$evidence_dir/workspace-create.json")
session_id=$(jq -r '.agents[] | select(.ok == true and .kind == "terminal") | .sessionId' \
  "$evidence_dir/workspace-create.json")
test -n "$workspace_id" && test "$workspace_id" != "null"
test -n "$session_id" && test "$session_id" != "null"
```

Use the agent configured on the target host; replace `codex` when necessary.
Retain the real CLI exit code, stdout, and stderr. A screenshot cannot prove
that the CLI parser, upload, host resolution, or launch path succeeded.

For session-control changes, continue the same returned session instead of
creating synthetic renderer state:

```bash
bun run --cwd packages/cli dev -- --json agents sessions read \
  "$session_id" --local --lines 120 \
  > "$evidence_dir/session-read.json"

printf 'Report the fixture case id and stop.\n' \
  | bun run --cwd packages/cli dev -- --json agents sessions send \
      "$session_id" --local --wait --timeout 5m \
      > "$evidence_dir/session-send.json"
```

## 5. Verify the visible result through CDP

The CDP portion must demonstrate the renderer consequence of the CLI action:

1. Wait for the CLI-created workspace name to appear in the real sidebar.
2. Navigate through visible UI input. It is acceptable to use
   `Runtime.evaluate` to locate an element's bounding box, but activate it with
   CDP `Input.dispatchMouseEvent`; do not call `element.click()` or mutate app
   stores.
3. Exercise the relevant lifecycle boundary: open the workspace, focus the
   returned terminal session, switch away/back, or reload as required by the
   feature.
4. Capture `Page.captureScreenshot` only after the visible UI and measured
   state agree.

On macOS, the real deep-link lifecycle can focus the CLI-created terminal:

```bash
focus_id=$(date +%s)
open "superset://v2-workspace/$workspace_id?terminalId=$session_id&focusRequestId=$focus_id"
```

Use `xdg-open` or `start` on other platforms. After navigation, record through
CDP:

- `window.location.href` and the active route;
- the visible workspace name and terminal/session identifier;
- the focused element or other feature-specific state;
- a genuine `Page.captureScreenshot` PNG.

`apps/desktop/scripts/cdp-smoke-integrations.ts` is a dependency-free example
of selecting the renderer target and sending `Runtime.evaluate` over its
`webSocketDebuggerUrl`. Extend that pattern with `Input.dispatchMouseEvent` and
`Page.captureScreenshot` for the specific journey.

## 6. Evidence gate

Store generated evidence under the ignored directory
`test-results/cli-cdp/<case-id>/`. A complete CLI-to-CDP result contains:

- exact worktree, commit, renderer URL, CDP port, and API origin;
- CLI command, exit code, scrubbed stdout, and scrubbed stderr;
- returned workspace and session IDs;
- before/after screenshots captured by `Page.captureScreenshot`;
- machine-readable assertions tying the screenshot to the returned IDs and
  current route.

Classify the result honestly:

- **CLI E2E:** real CLI command reached the Electron-owned host service and its
  returned state was verified independently.
- **Product CDP:** the matched real renderer displayed and interacted with that
  exact CLI-created state.
- **Synthetic/diagnostic:** direct router calls, DOM mutation, store calls,
  renderer-only Vite, or generated HTML reports. These are not substitutes for
  the two gates above.

For attachment work, the CLI result or isolated acceptance capture proves the
upload and byte/path contract. A desktop attachment icon or tooltip by itself
does not prove CLI attachment support.

## 7. Cleanup

After evidence is captured, remove only the fixture created by this run:

```bash
bun run --cwd packages/cli dev -- --json workspaces delete \
  "$workspace_id" --local \
  > "$evidence_dir/workspace-delete.json"
rm -f "$attachment_path"
```

Do not delete `superset-dev-data`, another worktree's state, or a broad workspace
directory. Stop terminal A normally when testing is complete.
