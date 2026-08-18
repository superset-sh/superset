# Renderer churn UI profile runbook

Use this runbook to reproduce the production-shaped v2 workspace/Changes lifecycle with synthetic repositories. It complements `MEMORY_AND_WORKERS_REVIEW.md`; it is not a production-data load test.

## Safety and identity gate

Before starting, record all of the following in the result:

1. Read the repository root and `apps/desktop/AGENTS.md` instructions.
2. Fetch `origin/main`, merge or rebase it into the test branch, and record both the tested commit and the included `origin/main` commit.
3. Read this worktree's final API and renderer ports from `.env`. Confirm the ports are owned by processes launched from this exact worktree.
4. Choose an unused dedicated CDP port. Resolve the Electron process from its command path, require `--remote-debugging-port=<port>`, and require a page target whose URL uses this worktree's renderer port.
5. Verify `/api/auth/get-session` inside the matched renderer and require an active organization. Follow `apps/desktop/AGENTS.md` for local-only auth repair; never print a token or credential literal.
6. Require this worktree's local development database and host-service data root. Never use a production database, migration, production repository, copied production fixture, or another worktree's host DB.

For another worktree, such as `/Users/kietho/.superset/worktrees/1c99c8eb-1b31-4f04-9ac4-61a2760c74b6/agent/workspace-switch-cache`, repeat the gate from that directory and choose its own unused CDP port. Do not reuse the renderer, API, PID, page target, or auth result from a different workspace.

## Synthetic fixture

Create one synthetic Git repository with 20,000 tracked files and seven external worktrees. Start every path with the same logical dirty mix: 360 modified, 150 untracked, and 90 deleted files. Keep the fixture under an explicit `/private/tmp` prefix.

Use distinct branches for the external worktrees (`renderer-ui-1` through `renderer-ui-7`). Create the project through the visible **Add repository → Open from folder** journey, then adopt the existing external worktrees through the host-service `workspaceCreation.adopt` procedure. On current local-first main, the project and all eight workspace rows must live in this worktree's active-organization `host.db`. The visible Workspaces page and sidebar must both show all eight before measurement.

The repository fixture used by the review was created with:

```bash
bun packages/host-service/scripts/git-status-large-repo-profile.ts \
  --repo /private/tmp/superset-renderer-ui-large-repo \
  --out /tmp/superset-renderer-ui-setup-latest-main \
  --files 20000 --dirty 600 --events 1 --event-interval-ms 0 \
  --concurrency 4 --workspaces 8 --git-delay-ms 0 \
  --mode limited --flow event-bus --recreate
```

On the final tested main (`b06e97f`), that general-purpose harness threw after creating the fixture because its report path still expected `status.againstBase`. Treat that exception as a setup limitation, not a successful measurement: independently verify all roots, branches, and dirty counts before adopting them. Do not reuse the harness's partial result as renderer evidence.

The mutator must target existing tracked paths. Validate one generated path with `git ls-files --error-unmatch` before starting. For the 20k fixture used on 2026-07-19, tracked paths were shaped like:

```text
src/0000/file-000000.ts
...
src/0019/file-019999.ts
```

This validation is important: a wrong path silently creates untracked files and exercises the much more expensive untracked-file line counter instead of the requested tracked-file churn.

## Measured workload

Run three phases against a fresh launch. Keep the filesystem mutator and sampler as separate processes; attach the mutator's `close` listener immediately after spawning it so a fast post-fix run cannot finish before the listener exists.

| Phase | Duration | Work |
|---|---:|---|
| Baseline | 10 s | No writes; collect CDP round-trip latency, 50 ms renderer timer drift, and renderer RSS |
| Churn | 60 s | 120 ticks at 500 ms; append to 200 existing tracked files in each of eight workspaces per tick (1,600 writes/tick, 192,000 total) |
| Cooldown | 10 s | Stop writes; continue the same measurements and observe Changes freshness |

Run the filesystem mutator in a separate process so its synchronous filesystem work cannot starve the measurement process. Sample CDP about every 100 ms and RSS about every 500 ms. Report count, p50, p95, and max for every phase plus the number of 2 s CDP timeouts. Resolve renderer RSS from the process whose user-data directory and command path match this worktree; never select the first Electron renderer globally.

During churn, use real visible pointer/keyboard input to:

1. Open Changes in the initial main workspace.
2. Switch through `renderer-ui-1` through `renderer-ui-7`, opening Changes for each.
3. Open the v2 Workspaces list.
4. Return to main and visibly confirm the Changes list renders.

Record the route transitions from the matched CDP page. Use CDP `Input.dispatchMouseEvent` for real pointer input, and use runtime evaluation only to observe the route, the Changes scroller, and numeric state. Do not assign DOM properties or call internal app APIs as end-to-end proof. Record click-to-observed-state wall times separately from CDP round-trip latency. Capture before/during/after screenshots and verify each screenshot agrees with its route and observed state.

For a loaded Changes surface, record both the logical file count and the mounted DOM slice. When Pierre owns the viewport, record the `file-tree-container` shadow root's virtualized-list height, scroll viewport `clientHeight`/`scrollHeight`, and mounted `[data-type=item]` count. A virtualized result should retain the full scroll range while bounding mounted rows; a cached file count is not proof of status freshness. Exercise a real wheel event inside that viewport, switch both Folders and Tree modes with real pointer input, and select a projected folder-mode file row so path translation is covered end to end.

## Evidence and decision gate

- A responsive cached Changes list is not proof that background status is fresh. After cooldown, compare the visible count with a direct synthetic-repository status count and record any lag.
- Do not claim a freeze from a slow status result alone. Require the reported interaction to stop responding or exceed the defined timeout while the matched route and input journey are active.
- If the valid workload reproduces the freeze, capture a renderer CPU profile over the same mutation and visible-switch window and rank application frames by inclusive samples. Change product code only when the profile identifies a narrow hot path and the same workload can provide before/after evidence. In the 2026-07-19 run, eager `ChangesFoldersView` → `FileRow` mounting was that hot path; React/DOM creation and GC surrounded it. For a Pierre implementation, do not infer virtualization from the package alone: a host sized to full content makes all rows part of the viewport. Require a bounded host/client height, full scroll range, and bounded mounted-row count.
- If the valid workload does not reproduce, make documentation/measurement changes only.
- Discard any run whose paths, worktree count, auth, cloud rows, ports, page target, or mutation type do not match the gate.

The 2026-07-19 checkpoint montage is [renderer-churn-visible-lifecycle-checkpoints.mp4](artifacts/renderer-churn-visible-lifecycle-checkpoints.mp4). It contains four-second baseline/during/cooldown checkpoints, in that order, from the final shared-Pierre run; it is a checkpoint montage, not a continuous recording of every click. Preserve the source screenshots until the video has been decoded with `ffprobe`/`ffmpeg` and visually checked.

## Cleanup

1. Delete the synthetic local project through the matched host-service `project.remove` procedure and verify the project/workspace rows are absent from the active-organization host DB.
2. Stop the dedicated desktop stack and restore any local host-service rows left by an interrupted cleanup saga. If the test started a supporting Electric container, return it to its prior stopped/running state.
3. Remove all eight synthetic Git worktrees with explicit `git worktree remove --force` targets, then remove only the validated synthetic `/private/tmp` roots.
4. Remove temporary auth, CDP, profiler, screenshot, and result files. Restore any supporting service (for example Electric) to its pre-test running/stopped state.
5. Confirm the worktree contains only the intended documentation/measurement changes and that the API, renderer, and dedicated CDP ports are no longer listening.
