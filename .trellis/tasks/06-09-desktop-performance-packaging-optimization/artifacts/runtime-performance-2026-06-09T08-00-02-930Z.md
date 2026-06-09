# Desktop Runtime Performance Report

Generated at: 2026-06-09T08:00:15.974Z

## Capture

- Duration: 9.45 s
- Interval: 1.00 s
- Samples: 10
- Automation: enabled
- Window: 1844x1050, focused=false
- URL: `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87`


## Renderer Snapshot

| Metric | Value |
| --- | --- |
| URL | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87` |
| Ready state | complete |
| DOM nodes | 551 |
| Scripts | 7 |
| Stylesheets | 15 |
| Resources | 250 |
| Navigation duration | 284 ms |
| DOMContentLoaded | 276 ms |
| Load event | 284 ms |
| JS heap used | 181.2 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 19 | 17.6% | 153.6% | 4.0 GB | 4.2 GB |
| other-service | 13 | 2.8% | 5.3% | 6.2 GB | 6.2 GB |
| other | 32 | 20.4% | 156.2% | 10.2 GB | 10.4 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 14.0% | 125.3% | 535.6 MB | 535.7 MB |
| electron-main | 1 | 1.4% | 12.5% | 301.9 MB | 305.0 MB |
| host-service | 2 | 0.7% | 4.5% | 459.9 MB | 460.1 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.2 MB | 14.2 MB |
| terminal-host | 1 | 0.0% | 0.0% | 17.1 MB | 17.1 MB |
| electron-gpu | 1 | 0.8% | 6.9% | 213.6 MB | 376.6 MB |
| electron-network | 1 | 0.8% | 4.4% | 30.6 MB | 31.0 MB |
| desktop-dev-runner | 3 | 0.0% | 0.1% | 2.3 GB | 2.3 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.1% | 1.0% | 3.8 GB | 3.8 GB |
| other | 13 | 2.7% | 5.3% | 2.5 GB | 2.5 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57169 | workerd | 0.1% | 0.7% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 2.3 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 0.0% | 0.1% | 2.0 GB | `next-server (v16.2.6)` |
| 15860 | electron-renderer | 14.0% | 125.3% | 535.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 15653 | electron-gpu | 0.8% | 6.9% | 376.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 15071 | electron-main | 1.4% | 12.5% | 305.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 16521 | host-service | 0.7% | 4.5% | 233.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 16519 | host-service | 0.0% | 0.0% | 226.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 55870 | other | 0.1% | 0.4% | 187.0 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 72915 | other | 0.0% | 0.0% | 168.8 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 57684 | workerd | 0.0% | 0.3% | 137.2 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57038 | other | 2.6% | 5.3% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 15860 | electron-renderer | 14.0% | 125.3% | 535.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 57038 | other | 2.6% | 5.3% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 15071 | electron-main | 1.4% | 12.5% | 305.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 15654 | electron-network | 0.8% | 4.4% | 31.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 15653 | electron-gpu | 0.8% | 6.9% | 376.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 16521 | host-service | 0.7% | 4.5% | 233.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 55870 | other | 0.1% | 0.4% | 187.0 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 57169 | workerd | 0.1% | 0.7% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57684 | workerd | 0.0% | 0.3% | 137.2 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 2.3 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 0.0% | 0.1% | 2.0 GB | `next-server (v16.2.6)` |
| 55825 | electric-proxy | 0.0% | 0.0% | 2.4 MB | `bun run --cwd apps/electric-proxy dev` |

## Route Measurements

| Route | Mode | Open time | Actual URL | DOM nodes | Error |
| --- | --- | --- | --- | --- | --- |
| `/tasks` | tanstack-router | 977 ms | `http://localhost:3005/#/tasks` | 529 |  |
| `/settings/models` | tanstack-router | 843 ms | `http://localhost:3005/#/settings/models` | 594 |  |
| `/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat` | tanstack-router | 848 ms | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat` | 245 |  |

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
