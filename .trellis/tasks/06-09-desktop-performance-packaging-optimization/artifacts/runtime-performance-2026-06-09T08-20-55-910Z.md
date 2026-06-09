# Desktop Runtime Performance Report

Generated at: 2026-06-09T08:21:09.252Z

## Capture

- Duration: 9.42 s
- Interval: 1.00 s
- Samples: 10
- Automation: enabled
- Window: 1844x1050, focused=true
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
| Navigation duration | 396 ms |
| DOMContentLoaded | 375 ms |
| Load event | 396 ms |
| JS heap used | 193.1 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 13 | 20.1% | 145.7% | 5.7 GB | 5.8 GB |
| other-service | 13 | 2.8% | 5.2% | 6.2 GB | 6.2 GB |
| other | 26 | 22.9% | 146.9% | 11.8 GB | 11.9 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 15.5% | 115.7% | 514.5 MB | 532.9 MB |
| electron-main | 1 | 1.1% | 9.2% | 302.2 MB | 304.6 MB |
| host-service | 1 | 1.6% | 12.4% | 209.5 MB | 209.8 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.3 MB | 14.3 MB |
| electron-gpu | 1 | 1.5% | 6.0% | 292.7 MB | 375.0 MB |
| electron-network | 1 | 0.4% | 2.4% | 25.6 MB | 26.7 MB |
| desktop-dev-runner | 3 | 0.0% | 0.1% | 3.9 GB | 3.9 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.3% | 2.6% | 3.8 GB | 3.8 GB |
| other | 9 | 2.5% | 3.9% | 2.7 GB | 2.7 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 3.9 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 57169 | workerd | 0.2% | 1.0% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 22858 | other | 0.0% | 0.0% | 2.0 GB | `next-server (v16.2.6)` |
| 16458 | electron-renderer | 15.5% | 115.7% | 532.9 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 72915 | other | 0.0% | 0.0% | 421.8 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 16338 | electron-gpu | 1.5% | 6.0% | 375.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 16158 | electron-main | 1.1% | 9.2% | 304.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 17093 | host-service | 1.6% | 12.4% | 209.8 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 55870 | other | 0.1% | 0.3% | 177.6 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 57684 | workerd | 0.2% | 1.6% | 147.9 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57038 | other | 2.4% | 3.7% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 61342 | api | 0.0% | 0.0% | 56.8 MB | `node <repo>/apps/api/.next/dev/build/webpack-loaders.js 50173` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 16458 | electron-renderer | 15.5% | 115.7% | 532.9 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 57038 | other | 2.4% | 3.7% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 17093 | host-service | 1.6% | 12.4% | 209.8 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 16338 | electron-gpu | 1.5% | 6.0% | 375.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 16158 | electron-main | 1.1% | 9.2% | 304.6 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 16344 | electron-network | 0.4% | 2.4% | 26.7 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 57684 | workerd | 0.2% | 1.6% | 147.9 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57169 | workerd | 0.2% | 1.0% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 55870 | other | 0.1% | 0.3% | 177.6 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 3.9 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 55825 | electric-proxy | 0.0% | 0.0% | 2.4 MB | `bun run --cwd apps/electric-proxy dev` |
| 55826 | electric-proxy | 0.0% | 0.0% | 11.7 MB | `node <repo>/node_modules/.bin/dotenv -e ../../.env -- sh -c exec wrangler dev --port ${WRANGLER_PORT:-8787}` |

## Route Measurements

| Route | Mode | Open time | Actual URL | DOM nodes | Error |
| --- | --- | --- | --- | --- | --- |
| `/tasks` | tanstack-router | 1.08 s | `http://localhost:3005/#/tasks` | 529 |  |
| `/settings/models` | tanstack-router | 870 ms | `http://localhost:3005/#/settings/models` | 594 |  |
| `/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat` | tanstack-router | 909 ms | `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87/chat` | 245 |  |

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
