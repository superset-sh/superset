# Workspace switch cache: renderer churn evidence

Measured on 2026-07-19 against `7d278681819d49ce9801ea838a8a8ce546d2e26a`, which contains `origin/main` at `b06e97fc2bf6f179541e9529300d00351fd722fd` (PR #5783).

## Identity gate

- Worktree: `agent/workspace-switch-cache`
- API: `http://localhost:7321`
- Renderer: `http://localhost:7325`
- Dedicated CDP: `127.0.0.1:9562`
- Renderer PID: `23620`
- CDP target: `5683F2E9679A20C21711C9A5A30F8591`
- Authenticated organization: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- Neon branch: `workspace-switch-cache` (`br-orange-brook-aftysum1`, non-primary)

## Workload and lifecycle

- One synthetic repository with 20,000 tracked files and seven external worktrees.
- Each workspace began with 360 modified, 150 untracked, and 90 deleted files (600 status entries).
- The mutator attempted 120 ticks at 500 ms and appended to 200 tracked files per workspace per tick: 192,000 writes total.
- The measured window was 10 seconds baseline, 60 seconds churn, and 10 seconds cooldown.
- Real pointer events selected `renderer-ui-1` through `renderer-ui-7`, opened Changes in each, visited the Workspaces list, returned to `local`, and reopened Changes.

The machine was under enough concurrent pressure that the mutator completed in 116.762 seconds rather than its nominal 60 seconds. The UI measurement window remained 80 seconds, so mutations continued beyond the nominal churn phase. This is a more severe workload than the timing target, but it is a runbook deviation and the numbers should not be treated as a clean laboratory baseline.

Fixture registration used the isolated host-service API because the native Computer Use bridge was unavailable. The measured switching lifecycle itself used visible CDP pointer input. The active organization host state was isolated before the run and restored afterward.

## Results

| Phase | CDP round-trip p50 / p95 / max | Renderer timer drift p50 / p95 / max | Renderer RSS p50 / p95 / max |
|---|---:|---:|---:|
| Baseline | 2.87 / 9.94 / 1,496.72 ms | 0.10 / 1.20 / 1,705.80 ms | 1,389.66 / 1,432.16 / 1,432.16 MiB |
| Churn | 3.04 / 77.62 / 3,643.59 ms | 0 / 1.20 / 4,122.10 ms | 1,446.31 / 1,865.69 / 1,869.58 MiB |
| Cooldown | 1.43 / 4.81 / 12.04 ms | 0.10 / 1.10 / 5.10 ms | 1,859.48 / 1,865.33 / 1,865.33 MiB |

- All requested pointer actions eventually completed with zero 5-second CDP timeouts in the retained pass.
- Workspace route transitions were 372–625 ms except the first switch at 4,234 ms and the return to `local` at 4,777 ms.
- Changes-tab clicks were 72–149 ms.
- Checkpoints on `renderer-ui-4` and `renderer-ui-7` visibly captured `Loading changes...`.
- The return to `local` visibly restored its exact cached 600-file Changes view.
- After cooldown, direct Git reported 20,000 tracked changes plus 150 untracked paths in every workspace, while the visible `local` view still showed the cached 600-file snapshot. The background freshness gate therefore failed in this run.

This lifecycle exercised the current v2 route. It does not demonstrate a regression in the legacy-v1 cache fix from PR #5783; it exposes a separate v2 changes-refresh issue under renderer churn.

## Artifacts

- [15-second checkpoint video](artifacts/workspace-switch-cache-renderer-churn-evidence.mp4)
- [Raw profile results](artifacts/workspace-switch-cache-renderer-churn-profile.json)

The MP4 is a runbook-style checkpoint montage rather than a continuous screen recording. It shows baseline, two in-churn loading states, return to the cached main view, and the cooldown state.

## Cache-first after-run

The cache-first v2 status change was rerun on top of PR #5782's Changes-folder virtualization so the known eager-row renderer stall did not mask status behavior. Before churn, all eight workspaces were visited and their 600-file snapshots were allowed to settle. The same mutator then completed 192,000 writes in 60.001 seconds, followed by a real 10-second quiet period.

| Observation | Result |
|---|---:|
| Warm-workspace revisit transitions | 176–286 ms |
| Changes-tab actions | 9–19 ms |
| Return to `local` | 221 ms |
| `Loading changes...` on warmed revisits | Never |
| Immediate `local` snapshot | 2,150 files, with `Refreshing changes` |
| 5-second CDP timeouts | 0 |
| Churn CDP p50 / p95 / max | 0.40 / 4.69 / 258.83 ms |
| Churn timer-drift p50 / p95 / max | 0 / 1.10 / 254.00 ms |
| Cooldown CDP p50 / p95 / max | 0.44 / 3.31 / 72.77 ms |
| Cooldown timer-drift p50 / p95 / max | 0 / 1.00 / 2.80 ms |

The cached result stayed visible and interactive throughout the refresh. At the fixed 10-second quiet checkpoint, the foreground refresh was still running and the visible snapshot remained at 2,150 files; direct Git reported 20,150 changes. The trailing refresh eventually converged to the exact 20,150-file result and cleared the refresh indicator after the extended scan. Process inspection attributed that remaining latency to concurrent `git diff --numstat -z` work used to calculate additions and deletions, not to renderer blanking or cache eviction. Very large text files can therefore lengthen freshness convergence without increasing renderer cache size. Deferring or limiting numstat is a separate host-status optimization.

For path depth, a 20,000-path tree-shape microbenchmark took approximately 15 ms with shallow paths and 140 ms with 20 nested levels. Deep nesting adds work but did not approach the multi-second renderer stalls. The exact query identity remains `workspaceId + baseBranch`, so path depth cannot cause another workspace's snapshot to be shown.

Additional after-run artifacts:

- [Cache-first after-run checkpoint video](artifacts/workspace-switch-cache-responsive-after-evidence.mp4)
- [Cache-first after-run raw results](artifacts/workspace-switch-cache-responsive-after-profile.json)

## Exact PR-only cherry-pick A/B

To separate this PR from the Changes-list virtualization in PR #5782, two
fresh worktrees were created at the same baseline commit
`7d278681819d49ce9801ea838a8a8ce546d2e26a`. The treatment worktree
cherry-picked only `48ac673d0` and `61b20cbd9`; its resulting commit was
`a5390c9fe`. The diff contained the seven cache-first/scheduler files and no
PR #5782 code. Each worktree used its own renderer, API, CDP port, Neon branch,
renderer profile, and fresh active-organization host database. The same Git
fixture was reset to 600 changes per workspace before treatment.

Both retained runs completed the identical 192,000-write mutation in 60
seconds. The result isolates an important dependency:

| Churn observation | Before `7d2786818` | PR-only treatment `a5390c9fe` |
|---|---:|---:|
| CDP p50 / p95 / max | 0.46 / 333.49 / 1,582.01 ms | 0.46 / 431.24 / 2,897.00 ms |
| Timer drift p50 / p95 / max | 0 / 2.20 / 1,647.40 ms | 0 / 85.30 / 8,904.80 ms |
| Sampler CDP timeouts | 0 | 7 |
| Longest visible action | 1,766.62 ms | one 15,000 ms timeout; other switches up to 7,903.89 ms |
| Immediate return to `local` | cached 600 files; no refresh affordance | exact cached 2,950 files; `Refreshing changes`; no loading blank |

The PR-only treatment proves the cache-first UX contract: exact-workspace data
remained visible and refresh progress was exposed. It does **not** improve raw
renderer responsiveness by itself under an eventually large result. Once a
larger status snapshot arrived, the baseline eager `FileRow` renderer mounted
thousands of rows and dominated the main thread. That independent bottleneck
is why the current-main validation must include PR #5782, and why the earlier
combined CDP improvement must not be attributed to this PR alone.

Exact A/B artifacts:

- [12-second checkpoint video](artifacts/workspace-switch-cache-exact-cherry-pick-ab-evidence.mp4) — first six seconds are before baseline/churn/return; final six seconds are PR-only treatment baseline/churn/return
- [Before raw results](artifacts/workspace-switch-cache-exact-cherry-pick-before-profile.json)
- [PR-only treatment raw results](artifacts/workspace-switch-cache-exact-cherry-pick-after-profile.json)
