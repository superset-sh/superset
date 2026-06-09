# Desktop Runtime Performance Report

Generated at: 2026-06-09T08:47:12.683Z

## Capture

- Duration: 4.24 s
- Interval: 1.00 s
- Samples: 5
- Automation: enabled
- Window: 1844x1050, focused=true
- URL: `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87`


## Startup Timeline

- Process started: 2026-06-09T08:46:46.428Z
- Uptime at capture: 21.25 s

| Mark | Elapsed | Timestamp | Detail |
| --- | --- | --- | --- |
| main:process-start | 0 ms | 2026-06-09T08:46:46.428Z |  |
| main:index-module-ready | 1.34 s | 2026-06-09T08:46:47.772Z |  |
| electron:when-ready-start | 1.35 s | 2026-06-09T08:46:47.778Z |  |
| electron:app-ready | 1.42 s | 2026-06-09T08:46:47.844Z |  |
| main:init-app-state-start | 1.53 s | 2026-06-09T08:46:47.953Z |  |
| main:init-app-state-end | 1.54 s | 2026-06-09T08:46:47.971Z |  |
| main:tanstack-persistence-start | 1.54 s | 2026-06-09T08:46:47.971Z |  |
| main:tanstack-persistence-end | 1.55 s | 2026-06-09T08:46:47.979Z |  |
| main:network-logger-start | 1.55 s | 2026-06-09T08:46:47.979Z |  |
| main:network-logger-end | 1.61 s | 2026-06-09T08:46:48.039Z |  |
| main:webview-extension-start | 1.61 s | 2026-06-09T08:46:48.039Z |  |
| main:webview-extension-end | 1.61 s | 2026-06-09T08:46:48.042Z |  |
| main:terminal-reconcile-start | 1.61 s | 2026-06-09T08:46:48.042Z |  |
| main:terminal-reconcile-end | 1.61 s | 2026-06-09T08:46:48.042Z |  |
| main:terminal-prewarm-start | 1.61 s | 2026-06-09T08:46:48.042Z |  |
| main:terminal-prewarm-end | 1.62 s | 2026-06-09T08:46:48.043Z |  |
| main:window-setup-start | 1.66 s | 2026-06-09T08:46:48.088Z |  |
| main-window:create-start | 1.67 s | 2026-06-09T08:46:48.095Z |  |
| main-window:browser-window-create-start | 1.67 s | 2026-06-09T08:46:48.096Z |  |
| main-window:browser-window-create-end | 1.78 s | 2026-06-09T08:46:48.210Z |  |
| main:window-setup-end | 1.79 s | 2026-06-09T08:46:48.222Z |  |
| main:app-ready-complete | 1.80 s | 2026-06-09T08:46:48.230Z |  |
| renderer:boot-mounted | 2.10 s | 2026-06-09T08:46:48.525Z | `{"rendererElapsedMs":319.89999997615814,"href":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87","readyState":"interactive"}` |
| main-window:renderer-did-finish-load | 2.11 s | 2026-06-09T08:46:48.542Z | `{"url":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87"}` |
| main-window:first-show | 2.12 s | 2026-06-09T08:46:48.552Z |  |

| Adjacent phase | Duration |
| --- | --- |
| main:process-start -> main:index-module-ready | 1.34 s |
| main:index-module-ready -> electron:when-ready-start | 6 ms |
| electron:when-ready-start -> electron:app-ready | 66 ms |
| electron:app-ready -> main:init-app-state-start | 110 ms |
| main:init-app-state-start -> main:init-app-state-end | 18 ms |
| main:init-app-state-end -> main:tanstack-persistence-start | 0 ms |
| main:tanstack-persistence-start -> main:tanstack-persistence-end | 8 ms |
| main:tanstack-persistence-end -> main:network-logger-start | 0 ms |
| main:network-logger-start -> main:network-logger-end | 60 ms |
| main:network-logger-end -> main:webview-extension-start | 0 ms |
| main:webview-extension-start -> main:webview-extension-end | 3 ms |
| main:webview-extension-end -> main:terminal-reconcile-start | 0 ms |
| main:terminal-reconcile-start -> main:terminal-reconcile-end | 0 ms |
| main:terminal-reconcile-end -> main:terminal-prewarm-start | 0 ms |
| main:terminal-prewarm-start -> main:terminal-prewarm-end | 0 ms |
| main:terminal-prewarm-end -> main:window-setup-start | 46 ms |
| main:window-setup-start -> main-window:create-start | 7 ms |
| main-window:create-start -> main-window:browser-window-create-start | 1 ms |
| main-window:browser-window-create-start -> main-window:browser-window-create-end | 115 ms |
| main-window:browser-window-create-end -> main:window-setup-end | 12 ms |
| main:window-setup-end -> main:app-ready-complete | 8 ms |
| main:app-ready-complete -> renderer:boot-mounted | 295 ms |
| renderer:boot-mounted -> main-window:renderer-did-finish-load | 17 ms |
| main-window:renderer-did-finish-load -> main-window:first-show | 10 ms |

## Renderer Snapshot

| Metric | Value |
| --- | --- |
| URL | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87` |
| Ready state | complete |
| DOM nodes | 550 |
| Scripts | 5 |
| Stylesheets | 15 |
| Resources | 250 |
| Navigation duration | 337 ms |
| DOMContentLoaded | 320 ms |
| Load event | 337 ms |
| JS heap used | 177.9 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 12 | 3.3% | 9.8% | 5.0 GB | 5.0 GB |
| other-service | 13 | 3.0% | 4.5% | 6.2 GB | 6.2 GB |
| other | 25 | 6.3% | 13.1% | 11.2 GB | 11.2 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 0.8% | 1.9% | 578.3 MB | 578.4 MB |
| electron-main | 1 | 0.3% | 0.9% | 332.9 MB | 333.4 MB |
| host-service | 1 | 0.9% | 3.7% | 247.6 MB | 247.6 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.2 MB | 14.2 MB |
| electron-gpu | 1 | 0.7% | 1.3% | 254.9 MB | 260.9 MB |
| electron-network | 1 | 0.6% | 3.2% | 33.7 MB | 33.7 MB |
| desktop-dev-runner | 3 | 0.0% | 0.1% | 3.1 GB | 3.1 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.0% | 0.1% | 3.8 GB | 3.8 GB |
| other | 8 | 3.0% | 4.5% | 2.7 GB | 2.7 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57169 | workerd | 0.0% | 0.1% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 3.1 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 0.0% | 0.0% | 2.0 GB | `next-server (v16.2.6)` |
| 17711 | electron-renderer | 0.8% | 1.9% | 578.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 72915 | other | 0.0% | 0.0% | 446.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 16984 | electron-main | 0.3% | 0.9% | 333.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 17631 | electron-gpu | 0.7% | 1.3% | 260.9 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 18796 | host-service | 0.9% | 3.7% | 247.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57038 | other | 3.0% | 4.5% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 18796 | host-service | 0.9% | 3.7% | 247.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 17711 | electron-renderer | 0.8% | 1.9% | 578.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 17631 | electron-gpu | 0.7% | 1.3% | 260.9 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 17633 | electron-network | 0.6% | 3.2% | 33.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 16984 | electron-main | 0.3% | 0.9% | 333.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 57169 | workerd | 0.0% | 0.1% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 3.1 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |

## Route Measurements

- No routes measured. Pass `--route=/tasks` or another hash route to collect route-open timings.

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
