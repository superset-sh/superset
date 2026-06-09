# Desktop Runtime Performance Report

Generated at: 2026-06-09T09:11:12.986Z

## Capture

- Duration: 9.43 s
- Interval: 1.00 s
- Samples: 10
- Automation: enabled
- Window: 1844x1050, focused=false
- URL: `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87`


## Startup Timeline

- Process started: 2026-06-09T09:08:13.352Z
- Uptime at capture: 169.63 s

| Mark | Elapsed | Timestamp | Detail |
| --- | --- | --- | --- |
| main:process-start | 0 ms | 2026-06-09T09:08:13.352Z |  |
| main:index-module-ready | 1.52 s | 2026-06-09T09:08:14.872Z |  |
| electron:when-ready-start | 1.52 s | 2026-06-09T09:08:14.877Z |  |
| electron:app-ready | 1.60 s | 2026-06-09T09:08:14.950Z |  |
| main:init-app-state-start | 1.69 s | 2026-06-09T09:08:15.038Z |  |
| main:init-app-state-end | 1.72 s | 2026-06-09T09:08:15.069Z |  |
| main:tanstack-persistence-start | 1.72 s | 2026-06-09T09:08:15.069Z |  |
| main:tanstack-persistence-end | 1.72 s | 2026-06-09T09:08:15.075Z |  |
| main:network-logger-start | 1.72 s | 2026-06-09T09:08:15.075Z |  |
| main:network-logger-end | 1.73 s | 2026-06-09T09:08:15.079Z |  |
| main:webview-extension-start | 1.73 s | 2026-06-09T09:08:15.079Z |  |
| main:webview-extension-end | 1.73 s | 2026-06-09T09:08:15.080Z |  |
| main:terminal-reconcile-start | 1.73 s | 2026-06-09T09:08:15.080Z |  |
| main:terminal-reconcile-end | 1.73 s | 2026-06-09T09:08:15.081Z |  |
| main:terminal-prewarm-start | 1.73 s | 2026-06-09T09:08:15.081Z |  |
| main:terminal-prewarm-end | 1.73 s | 2026-06-09T09:08:15.081Z |  |
| main:window-setup-start | 1.80 s | 2026-06-09T09:08:15.156Z |  |
| main-window:create-start | 1.81 s | 2026-06-09T09:08:15.162Z |  |
| main-window:browser-window-create-start | 1.81 s | 2026-06-09T09:08:15.162Z |  |
| main-window:browser-window-create-end | 1.90 s | 2026-06-09T09:08:15.251Z |  |
| main:window-setup-end | 1.91 s | 2026-06-09T09:08:15.266Z |  |
| main:app-ready-complete | 1.92 s | 2026-06-09T09:08:15.274Z |  |
| renderer:boot-mounted | 2.45 s | 2026-06-09T09:08:15.803Z | `{"rendererElapsedMs":554.4000000953674,"href":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87","readyState":"interactive"}` |
| main-window:renderer-did-finish-load | 2.48 s | 2026-06-09T09:08:15.833Z | `{"url":"http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87"}` |
| main-window:first-show | 2.49 s | 2026-06-09T09:08:15.841Z |  |

| Adjacent phase | Duration |
| --- | --- |
| main:process-start -> main:index-module-ready | 1.52 s |
| main:index-module-ready -> electron:when-ready-start | 5 ms |
| electron:when-ready-start -> electron:app-ready | 73 ms |
| electron:app-ready -> main:init-app-state-start | 88 ms |
| main:init-app-state-start -> main:init-app-state-end | 31 ms |
| main:init-app-state-end -> main:tanstack-persistence-start | 0 ms |
| main:tanstack-persistence-start -> main:tanstack-persistence-end | 7 ms |
| main:tanstack-persistence-end -> main:network-logger-start | 0 ms |
| main:network-logger-start -> main:network-logger-end | 4 ms |
| main:network-logger-end -> main:webview-extension-start | 0 ms |
| main:webview-extension-start -> main:webview-extension-end | 1 ms |
| main:webview-extension-end -> main:terminal-reconcile-start | 0 ms |
| main:terminal-reconcile-start -> main:terminal-reconcile-end | 0 ms |
| main:terminal-reconcile-end -> main:terminal-prewarm-start | 0 ms |
| main:terminal-prewarm-start -> main:terminal-prewarm-end | 0 ms |
| main:terminal-prewarm-end -> main:window-setup-start | 75 ms |
| main:window-setup-start -> main-window:create-start | 5 ms |
| main-window:create-start -> main-window:browser-window-create-start | 0 ms |
| main-window:browser-window-create-start -> main-window:browser-window-create-end | 90 ms |
| main-window:browser-window-create-end -> main:window-setup-end | 14 ms |
| main:window-setup-end -> main:app-ready-complete | 8 ms |
| main:app-ready-complete -> renderer:boot-mounted | 529 ms |
| renderer:boot-mounted -> main-window:renderer-did-finish-load | 30 ms |
| main-window:renderer-did-finish-load -> main-window:first-show | 8 ms |

## Renderer Snapshot

| Metric | Value |
| --- | --- |
| URL | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87` |
| Ready state | complete |
| DOM nodes | 549 |
| Scripts | 5 |
| Stylesheets | 14 |
| Resources | 250 |
| Navigation duration | 584 ms |
| DOMContentLoaded | 555 ms |
| Load event | 584 ms |
| JS heap used | 162.2 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 12 | 1.6% | 7.6% | 4.7 GB | 4.7 GB |
| other-service | 13 | 1.6% | 4.7% | 6.2 GB | 6.2 GB |
| other | 25 | 3.3% | 12.3% | 10.9 GB | 10.9 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 0.5% | 4.1% | 526.9 MB | 527.3 MB |
| electron-main | 1 | 0.4% | 3.4% | 314.9 MB | 314.9 MB |
| host-service | 1 | 0.6% | 3.2% | 192.0 MB | 192.4 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.2 MB | 14.2 MB |
| electron-gpu | 1 | 0.0% | 0.0% | 138.5 MB | 138.5 MB |
| electron-network | 1 | 0.2% | 0.6% | 25.0 MB | 25.3 MB |
| desktop-dev-runner | 3 | 0.0% | 0.0% | 3.3 GB | 3.3 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.4% | 3.4% | 3.9 GB | 3.9 GB |
| other | 8 | 1.2% | 1.6% | 2.5 GB | 2.5 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57169 | workerd | 0.3% | 2.0% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.0% | 3.3 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 0.0% | 0.0% | 2.0 GB | `next-server (v16.2.6)` |
| 61282 | electron-renderer | 0.5% | 4.1% | 527.3 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 61088 | electron-main | 0.4% | 3.4% | 314.9 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 72915 | other | 0.0% | 0.0% | 239.6 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 67579 | host-service | 0.6% | 3.2% | 192.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 55870 | other | 0.0% | 0.3% | 186.9 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 57684 | workerd | 0.2% | 1.4% | 171.3 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 61231 | electron-gpu | 0.0% | 0.0% | 138.5 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 57038 | other | 1.2% | 1.5% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 61342 | api | 0.0% | 0.0% | 56.8 MB | `node <repo>/apps/api/.next/dev/build/webpack-loaders.js 50173` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57038 | other | 1.2% | 1.5% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 67579 | host-service | 0.6% | 3.2% | 192.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 61282 | electron-renderer | 0.5% | 4.1% | 527.3 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 61088 | electron-main | 0.4% | 3.4% | 314.9 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 57169 | workerd | 0.3% | 2.0% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 61233 | electron-network | 0.2% | 0.6% | 25.3 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 57684 | workerd | 0.2% | 1.4% | 171.3 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 55870 | other | 0.0% | 0.3% | 186.9 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 55825 | electric-proxy | 0.0% | 0.0% | 2.4 MB | `bun run --cwd apps/electric-proxy dev` |
| 55826 | electric-proxy | 0.0% | 0.0% | 11.7 MB | `node <repo>/node_modules/.bin/dotenv -e ../../.env -- sh -c exec wrangler dev --port ${WRANGLER_PORT:-8787}` |
| 55866 | electric-proxy | 0.0% | 0.0% | 10.8 MB | `node <repo>/apps/electric-proxy/node_modules/.bin/wrangler dev --port 3012` |
| 57681 | other | 0.0% | 0.0% | 9.8 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |

## Route Measurements

- No routes measured. Pass `--route=/tasks` or another hash route to collect route-open timings.

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
