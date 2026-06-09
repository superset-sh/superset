# Desktop Runtime Performance Report

Generated at: 2026-06-09T09:17:25.607Z

## Capture

- Duration: 9.51 s
- Interval: 1.00 s
- Samples: 10
- Automation: enabled
- Window: 1844x1050, focused=false
- URL: `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87`


## Startup Timeline

- Process started: 2026-06-09T09:14:39.280Z
- Uptime at capture: 156.32 s

| Mark | Elapsed | Timestamp | Detail |
| --- | --- | --- | --- |
| main:process-start | 0 ms | 2026-06-09T09:14:39.280Z |  |
| main:index-module-ready | 1.47 s | 2026-06-09T09:14:40.746Z |  |
| electron:when-ready-start | 1.47 s | 2026-06-09T09:14:40.754Z |  |
| electron:app-ready | 1.57 s | 2026-06-09T09:14:40.848Z |  |
| main:init-app-state-start | 1.68 s | 2026-06-09T09:14:40.961Z |  |
| main:init-app-state-end | 1.71 s | 2026-06-09T09:14:40.995Z |  |
| main:tanstack-persistence-start | 1.72 s | 2026-06-09T09:14:40.995Z |  |
| main:tanstack-persistence-end | 1.72 s | 2026-06-09T09:14:41.004Z |  |
| main:network-logger-start | 1.72 s | 2026-06-09T09:14:41.004Z |  |
| main:network-logger-end | 1.73 s | 2026-06-09T09:14:41.008Z |  |
| main:webview-extension-start | 1.73 s | 2026-06-09T09:14:41.008Z |  |
| main:webview-extension-end | 1.73 s | 2026-06-09T09:14:41.010Z |  |
| main:terminal-reconcile-start | 1.73 s | 2026-06-09T09:14:41.010Z |  |
| main:terminal-reconcile-end | 1.73 s | 2026-06-09T09:14:41.010Z |  |
| main:terminal-prewarm-start | 1.73 s | 2026-06-09T09:14:41.010Z |  |
| main:terminal-prewarm-end | 1.73 s | 2026-06-09T09:14:41.010Z |  |
| main:window-setup-start | 1.78 s | 2026-06-09T09:14:41.059Z |  |
| main-window:create-start | 1.78 s | 2026-06-09T09:14:41.063Z |  |
| main-window:browser-window-create-start | 1.78 s | 2026-06-09T09:14:41.063Z |  |
| main-window:browser-window-create-end | 1.89 s | 2026-06-09T09:14:41.172Z |  |
| main:window-setup-end | 1.91 s | 2026-06-09T09:14:41.185Z |  |
| main:app-ready-complete | 1.92 s | 2026-06-09T09:14:41.204Z |  |
| renderer:boot-mounted | 2.44 s | 2026-06-09T09:14:41.716Z | `{"rendererElapsedMs":546.6000000238419,"href":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87","readyState":"interactive"}` |
| main-window:renderer-did-finish-load | 2.46 s | 2026-06-09T09:14:41.737Z | `{"url":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87"}` |
| main-window:first-show | 2.47 s | 2026-06-09T09:14:41.751Z |  |

| Adjacent phase | Duration |
| --- | --- |
| main:process-start -> main:index-module-ready | 1.47 s |
| main:index-module-ready -> electron:when-ready-start | 9 ms |
| electron:when-ready-start -> electron:app-ready | 93 ms |
| electron:app-ready -> main:init-app-state-start | 113 ms |
| main:init-app-state-start -> main:init-app-state-end | 34 ms |
| main:init-app-state-end -> main:tanstack-persistence-start | 0 ms |
| main:tanstack-persistence-start -> main:tanstack-persistence-end | 9 ms |
| main:tanstack-persistence-end -> main:network-logger-start | 0 ms |
| main:network-logger-start -> main:network-logger-end | 4 ms |
| main:network-logger-end -> main:webview-extension-start | 0 ms |
| main:webview-extension-start -> main:webview-extension-end | 2 ms |
| main:webview-extension-end -> main:terminal-reconcile-start | 0 ms |
| main:terminal-reconcile-start -> main:terminal-reconcile-end | 0 ms |
| main:terminal-reconcile-end -> main:terminal-prewarm-start | 0 ms |
| main:terminal-prewarm-start -> main:terminal-prewarm-end | 0 ms |
| main:terminal-prewarm-end -> main:window-setup-start | 49 ms |
| main:window-setup-start -> main-window:create-start | 4 ms |
| main-window:create-start -> main-window:browser-window-create-start | 0 ms |
| main-window:browser-window-create-start -> main-window:browser-window-create-end | 109 ms |
| main-window:browser-window-create-end -> main:window-setup-end | 13 ms |
| main:window-setup-end -> main:app-ready-complete | 19 ms |
| main:app-ready-complete -> renderer:boot-mounted | 512 ms |
| renderer:boot-mounted -> main-window:renderer-did-finish-load | 22 ms |
| main-window:renderer-did-finish-load -> main-window:first-show | 13 ms |

## Renderer Snapshot

| Metric | Value |
| --- | --- |
| URL | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87` |
| Ready state | complete |
| DOM nodes | 551 |
| Scripts | 5 |
| Stylesheets | 15 |
| Resources | 250 |
| Navigation duration | 568 ms |
| DOMContentLoaded | 547 ms |
| Load event | 568 ms |
| JS heap used | 157.1 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 12 | 5.9% | 52.4% | 5.0 GB | 5.0 GB |
| other-service | 13 | 1.5% | 3.9% | 6.2 GB | 6.2 GB |
| other | 25 | 7.3% | 53.1% | 11.2 GB | 11.2 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 5.2% | 50.1% | 516.8 MB | 517.0 MB |
| electron-main | 1 | 0.3% | 2.3% | 311.6 MB | 311.7 MB |
| host-service | 1 | 0.2% | 0.7% | 195.9 MB | 196.0 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.3 MB | 14.3 MB |
| electron-gpu | 1 | 0.0% | 0.0% | 139.5 MB | 139.5 MB |
| electron-network | 1 | 0.2% | 0.9% | 25.9 MB | 26.0 MB |
| desktop-dev-runner | 3 | 0.0% | 0.0% | 3.5 GB | 3.5 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.0% | 0.0% | 3.9 GB | 3.9 GB |
| other | 8 | 1.5% | 3.9% | 2.5 GB | 2.5 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57169 | workerd | 0.0% | 0.0% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.0% | 3.4 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 0.0% | 0.0% | 1.9 GB | `next-server (v16.2.6)` |
| 8475 | electron-renderer | 5.2% | 50.1% | 517.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 72915 | other | 0.0% | 0.0% | 332.4 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 8239 | electron-main | 0.3% | 2.3% | 311.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 15601 | host-service | 0.2% | 0.7% | 196.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 55870 | other | 0.0% | 0.0% | 187.2 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 57684 | workerd | 0.0% | 0.0% | 173.2 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 8408 | electron-gpu | 0.0% | 0.0% | 139.5 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 57038 | other | 1.5% | 3.9% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 61342 | api | 0.0% | 0.0% | 56.8 MB | `node <repo>/apps/api/.next/dev/build/webpack-loaders.js 50173` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 8475 | electron-renderer | 5.2% | 50.1% | 517.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 57038 | other | 1.5% | 3.9% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 8239 | electron-main | 0.3% | 2.3% | 311.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 15601 | host-service | 0.2% | 0.7% | 196.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 8409 | electron-network | 0.2% | 0.9% | 26.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 16675 | pty-daemon | 0.0% | 0.0% | 14.3 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/pty-daemon.js --socket=/...` |
| 55825 | electric-proxy | 0.0% | 0.0% | 2.4 MB | `bun run --cwd apps/electric-proxy dev` |
| 55826 | electric-proxy | 0.0% | 0.0% | 11.7 MB | `node <repo>/node_modules/.bin/dotenv -e ../../.env -- sh -c exec wrangler dev --port ${WRANGLER_PORT:-8787}` |
| 55866 | electric-proxy | 0.0% | 0.0% | 10.8 MB | `node <repo>/apps/electric-proxy/node_modules/.bin/wrangler dev --port 3012` |
| 55870 | other | 0.0% | 0.0% | 187.2 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 57169 | workerd | 0.0% | 0.0% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57681 | other | 0.0% | 0.0% | 9.8 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |

## Route Measurements

- No routes measured. Pass `--route=/tasks` or another hash route to collect route-open timings.

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
