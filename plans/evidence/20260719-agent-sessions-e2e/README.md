# Agent-session CLI E2E evidence

This directory contains a reproducible, isolated acceptance run for `plans/20260717-1616-cli-sidebar-groups.md`. It separates product-CDP evidence from CLI transcript evidence so neither is presented as proof of behavior it cannot show.

## Result

- 17/17 behavioral assertions passed.
- 23 real CLI subprocesses were recorded with commands, exit codes, stdout, and stderr.
- The PTY daemon ran under Electron-as-Node, exercising the production `node-pty` ABI.
- The host service, manifest, database, Git repository/worktrees, attachments, and Superset home were temporary and isolated from normal desktop state.
- Commit under test: `80d8f8a17ce64e6fec3d9bc1d60c168853241187` (also embedded in the generated reports).

## Evidence map

| Artifact | Purpose |
| --- | --- |
| `automated/report.png` | Reviewable screenshot of the generated assertion report and command index |
| `automated/report.html` | Expandable report containing the actual abbreviated commands and captured outputs |
| `automated/results.json` | Machine-readable assertions, commands, exit codes, stdout, stderr, runtime, and commit |
| `automated/transcript.md` | Plain-text review transcript generated from the same in-memory run records |
| `automated/capture.jsonl` | Raw base64 fake-agent prompt records used for exact byte comparisons |
| `automated/host.db` | Checkpointed isolated host database for session/workspace inspection |
| `cdp/desktop-new-workspace-attachments.png` | Full Electron renderer captured through CDP with the New Workspace surface open |
| `cdp/desktop-attachment-tooltip.png` | CDP close-up showing the visible `Add attachment` affordance and tooltip |
| `cdp/desktop-agent-picker.png` | CDP close-up showing the renderer's agent picker options |
| `cdp/assertions.json` | CDP target, renderer-port, auth, modal, attachment-control, and capture-method assertions |

`automated/report.png` is a rendering of generated E2E results, not a product screenshot. The `cdp/*.png` files are actual Electron `Page.captureScreenshot` results from this worktree's renderer on port 7485, attached through isolated CDP port 29422. They validate the visible New Workspace attachment and agent-selection surfaces only. The authoritative evidence for headless `agents sessions list/read/send/wait` behavior remains `automated/results.json`, the raw capture/database, and the executable harness in `packages/cli/test/e2e/`.

## Covered behavior

- Lossless 87,994-byte multiline/Unicode launch with exact SHA-256 agreement.
- `agents sessions list`, `read`, `send`, and `wait` through the real CLI parser, middleware, local-host target resolution, HTTP transport, host router, and PTY daemon.
- Normalized `working`, `permission`, `failed`, and `idle` lifecycle states.
- Exact multiline stdin, `--file`, and `--file -` follow-up bytes.
- Host-service-only restart followed by read/send on the same daemon-owned terminal.
- Timeout and SIGINT cancellation as explicit non-zero CLI outcomes.
- Immediate executable failure with status 127 and no false session ID.
- Unknown and exited sessions rejected without replacement processes.
- The exact SUPER-1568 path: `workspaces create --local --agent e2e --attachment ...` creates a real Git worktree, launches the inline agent, and passes a host-readable attachment whose bytes match the source file.

## Reproduce

Default ignored artifacts:

```bash
bun run test:cli-e2e
```

Regenerate this retained bundle:

```bash
bun run test:cli-e2e -- \
  --artifacts plans/evidence/20260719-agent-sessions-e2e/automated
```

The acceptance standard and isolation requirements are documented in the repository `AGENTS.md` under “CLI End-to-End Verification.”
