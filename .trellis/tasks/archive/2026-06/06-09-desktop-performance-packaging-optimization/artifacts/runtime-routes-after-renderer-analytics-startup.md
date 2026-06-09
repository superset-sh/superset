# Desktop Runtime Performance Report

Generated at: 2026-06-09T08:45:53.804Z

## Capture

- Duration: 9.45 s
- Interval: 1.00 s
- Samples: 10
- Automation: enabled
- Window: 1844x1050, focused=true
- URL: `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87`


## Startup Timeline

- Process started: 2026-06-09T08:42:58.258Z
- Uptime at capture: 165.54 s

| Mark | Elapsed | Timestamp | Detail |
| --- | --- | --- | --- |
| main:process-start | 0 ms | 2026-06-09T08:42:58.258Z |  |
| main:startup-performance-module-loaded | 1.55 s | 2026-06-09T08:42:59.807Z |  |
| main:index-module-ready | 1.58 s | 2026-06-09T08:42:59.835Z |  |
| electron:when-ready-start | 1.58 s | 2026-06-09T08:42:59.841Z |  |
| electron:app-ready | 1.71 s | 2026-06-09T08:42:59.969Z |  |
| main:init-app-state-start | 1.83 s | 2026-06-09T08:43:00.084Z |  |
| main:init-app-state-end | 1.84 s | 2026-06-09T08:43:00.102Z |  |
| main:tanstack-persistence-start | 1.84 s | 2026-06-09T08:43:00.102Z |  |
| main:tanstack-persistence-end | 1.86 s | 2026-06-09T08:43:00.114Z |  |
| main:network-logger-start | 1.86 s | 2026-06-09T08:43:00.114Z |  |
| main:network-logger-end | 1.88 s | 2026-06-09T08:43:00.135Z |  |
| main:webview-extension-start | 1.88 s | 2026-06-09T08:43:00.135Z |  |
| main:webview-extension-end | 1.88 s | 2026-06-09T08:43:00.138Z |  |
| main:terminal-reconcile-start | 1.88 s | 2026-06-09T08:43:00.138Z |  |
| main:terminal-reconcile-end | 1.88 s | 2026-06-09T08:43:00.139Z |  |
| main:terminal-prewarm-start | 1.88 s | 2026-06-09T08:43:00.139Z |  |
| main:terminal-prewarm-end | 1.88 s | 2026-06-09T08:43:00.139Z |  |
| main:window-setup-start | 1.91 s | 2026-06-09T08:43:00.168Z |  |
| main-window:create-start | 1.91 s | 2026-06-09T08:43:00.172Z |  |
| main-window:browser-window-create-start | 1.91 s | 2026-06-09T08:43:00.172Z |  |
| main-window:browser-window-create-end | 2.01 s | 2026-06-09T08:43:00.268Z |  |
| main:window-setup-end | 2.03 s | 2026-06-09T08:43:00.286Z |  |
| main:app-ready-complete | 2.04 s | 2026-06-09T08:43:00.299Z |  |
| renderer:boot-mounted | 2.74 s | 2026-06-09T08:43:00.996Z | `{"rendererElapsedMs":734,"href":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87","readyState":"interactive"}` |
| main-window:renderer-did-finish-load | 2.76 s | 2026-06-09T08:43:01.013Z | `{"url":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87"}` |
| main-window:first-show | 2.77 s | 2026-06-09T08:43:01.028Z |  |

| Adjacent phase | Duration |
| --- | --- |
| main:process-start -> main:startup-performance-module-loaded | 1.55 s |
| main:startup-performance-module-loaded -> main:index-module-ready | 29 ms |
| main:index-module-ready -> electron:when-ready-start | 6 ms |
| electron:when-ready-start -> electron:app-ready | 128 ms |
| electron:app-ready -> main:init-app-state-start | 115 ms |
| main:init-app-state-start -> main:init-app-state-end | 18 ms |
| main:init-app-state-end -> main:tanstack-persistence-start | 0 ms |
| main:tanstack-persistence-start -> main:tanstack-persistence-end | 12 ms |
| main:tanstack-persistence-end -> main:network-logger-start | 0 ms |
| main:network-logger-start -> main:network-logger-end | 21 ms |
| main:network-logger-end -> main:webview-extension-start | 0 ms |
| main:webview-extension-start -> main:webview-extension-end | 3 ms |
| main:webview-extension-end -> main:terminal-reconcile-start | 0 ms |
| main:terminal-reconcile-start -> main:terminal-reconcile-end | 1 ms |
| main:terminal-reconcile-end -> main:terminal-prewarm-start | 0 ms |
| main:terminal-prewarm-start -> main:terminal-prewarm-end | 0 ms |
| main:terminal-prewarm-end -> main:window-setup-start | 29 ms |
| main:window-setup-start -> main-window:create-start | 4 ms |
| main-window:create-start -> main-window:browser-window-create-start | 0 ms |
| main-window:browser-window-create-start -> main-window:browser-window-create-end | 96 ms |
| main-window:browser-window-create-end -> main:window-setup-end | 18 ms |
| main:window-setup-end -> main:app-ready-complete | 13 ms |
| main:app-ready-complete -> renderer:boot-mounted | 697 ms |
| renderer:boot-mounted -> main-window:renderer-did-finish-load | 17 ms |
| main-window:renderer-did-finish-load -> main-window:first-show | 15 ms |

## Renderer Snapshot

| Metric | Value |
| --- | --- |
| URL | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87` |
| Ready state | complete |
| DOM nodes | 559 |
| Scripts | 5 |
| Stylesheets | 15 |
| Resources | 250 |
| Navigation duration | 751 ms |
| DOMContentLoaded | 734 ms |
| Load event | 751 ms |
| JS heap used | 173.2 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 13 | 15.3% | 112.9% | 4.3 GB | 4.4 GB |
| other-service | 14 | 7.4% | 46.6% | 6.2 GB | 6.2 GB |
| other | 26 | 22.8% | 116.8% | 10.5 GB | 10.6 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 10.0% | 82.5% | 552.3 MB | 559.1 MB |
| electron-main | 1 | 1.4% | 9.4% | 304.3 MB | 305.8 MB |
| host-service | 1 | 1.6% | 12.6% | 238.8 MB | 240.4 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.0 MB | 14.0 MB |
| electron-gpu | 1 | 1.3% | 5.6% | 309.0 MB | 390.6 MB |
| electron-network | 1 | 1.1% | 6.7% | 27.0 MB | 27.3 MB |
| desktop-dev-runner | 3 | 0.0% | 0.1% | 2.7 GB | 2.7 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.9% | 8.6% | 3.8 GB | 3.8 GB |
| other | 9 | 6.5% | 38.0% | 2.5 GB | 2.5 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57169 | workerd | 0.6% | 5.4% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 2.7 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 3.3% | 29.8% | 2.0 GB | `next-server (v16.2.6)` |
| 90881 | electron-renderer | 10.0% | 82.5% | 559.1 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 90748 | electron-gpu | 1.3% | 5.6% | 390.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 90293 | electron-main | 1.4% | 9.4% | 305.8 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 99480 | host-service | 1.6% | 12.6% | 240.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 72915 | other | 0.0% | 0.0% | 201.4 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 55870 | other | 0.3% | 3.2% | 186.8 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 57684 | workerd | 0.4% | 3.2% | 161.2 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57038 | other | 2.6% | 3.9% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 61342 | api | 0.0% | 0.0% | 56.8 MB | `node <repo>/apps/api/.next/dev/build/webpack-loaders.js 50173` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 90881 | electron-renderer | 10.0% | 82.5% | 559.1 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 22858 | other | 3.3% | 29.8% | 2.0 GB | `next-server (v16.2.6)` |
| 13295 | other | 2.8% | 2.8% | 26.7 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node <repo>/node_modules/.bun/next@16.2.6+5392b427564f09be/node_modules/next/dist/compiled/jest-worker/process...` |
| 57038 | other | 2.6% | 3.9% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 99480 | host-service | 1.6% | 12.6% | 240.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 90293 | electron-main | 1.4% | 9.4% | 305.8 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 90748 | electron-gpu | 1.3% | 5.6% | 390.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 90752 | electron-network | 1.1% | 6.7% | 27.3 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 57169 | workerd | 0.6% | 5.4% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57684 | workerd | 0.4% | 3.2% | 161.2 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 55870 | other | 0.3% | 3.2% | 186.8 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 2.7 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |

## Route Measurements

| Route | Mode | Open time | Actual URL | DOM nodes | Error |
| --- | --- | --- | --- | --- | --- |
| `/tasks` | tanstack-router | 2.33 s | `http://localhost:3005/#/tasks` | 527 |  |
| `/settings/models` | tanstack-router | 1.36 s | `http://localhost:3005/#/settings/models` | 592 |  |
| `/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat` | tanstack-router | 910 ms | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat` | 243 |  |

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
