# Desktop Runtime Performance Report

Generated at: 2026-06-09T08:25:38.374Z

## Capture

- Duration: 9.45 s
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
| DOM nodes | 542 |
| Scripts | 7 |
| Stylesheets | 15 |
| Resources | 250 |
| Navigation duration | 401 ms |
| DOMContentLoaded | 389 ms |
| Load event | 401 ms |
| JS heap used | 169.1 MB |

## Process Totals

| Scope | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| desktop-dev-runner | 12 | 3.3% | 17.2% | 4.3 GB | 4.3 GB |
| other-service | 13 | 4.2% | 12.8% | 6.2 GB | 6.2 GB |
| other | 25 | 7.5% | 30.0% | 10.4 GB | 10.4 GB |

## Process Groups

| Group | Max count | Avg CPU | Max CPU | Avg memory | Max memory |
| --- | --- | --- | --- | --- | --- |
| electron-renderer | 1 | 1.1% | 4.9% | 553.6 MB | 554.1 MB |
| electron-main | 1 | 0.3% | 2.5% | 302.3 MB | 302.4 MB |
| host-service | 1 | 0.5% | 1.9% | 215.5 MB | 215.5 MB |
| pty-daemon | 1 | 0.0% | 0.0% | 14.3 MB | 14.3 MB |
| electron-gpu | 1 | 0.9% | 1.7% | 236.1 MB | 236.1 MB |
| electron-network | 1 | 0.6% | 6.1% | 26.8 MB | 27.0 MB |
| desktop-dev-runner | 3 | 0.0% | 0.1% | 2.8 GB | 2.8 GB |
| api | 3 | 0.0% | 0.0% | 81.6 MB | 81.6 MB |
| electric-proxy | 3 | 0.0% | 0.0% | 24.9 MB | 24.9 MB |
| workerd | 2 | 0.7% | 7.4% | 3.8 GB | 3.8 GB |
| other | 8 | 3.5% | 10.7% | 2.4 GB | 2.4 GB |

## Top Processes By Memory

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57169 | workerd | 0.5% | 5.4% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 2.7 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 22858 | other | 0.0% | 0.0% | 2.0 GB | `next-server (v16.2.6)` |
| 16458 | electron-renderer | 1.1% | 4.9% | 554.1 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 16158 | electron-main | 0.3% | 2.5% | 302.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 16338 | electron-gpu | 0.9% | 1.7% | 236.1 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 17093 | host-service | 0.5% | 1.9% | 215.5 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 55870 | other | 0.2% | 1.6% | 182.0 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 72915 | other | 0.0% | 0.1% | 170.1 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.4/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.4 --ping` |
| 57684 | workerd | 0.2% | 2.0% | 150.0 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 57038 | other | 3.3% | 10.7% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 61342 | api | 0.0% | 0.0% | 56.8 MB | `node <repo>/apps/api/.next/dev/build/webpack-loaders.js 50173` |

## Top Processes By CPU

| PID | Role | Avg CPU | Max CPU | Max memory | Command |
| --- | --- | --- | --- | --- | --- |
| 57038 | other | 3.3% | 10.7% | 95.7 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 16458 | electron-renderer | 1.1% | 4.9% | 554.1 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Hel...` |
| 16338 | electron-gpu | 0.9% | 1.7% | 236.1 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 16344 | electron-network | 0.6% | 6.1% | 27.0 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=...` |
| 57169 | workerd | 0.5% | 5.4% | 3.7 GB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 17093 | host-service | 0.5% | 1.9% | 215.5 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron <repo>/apps/desktop/dist/main/host-service.js` |
| 16158 | electron-main | 0.3% | 2.5% | 302.4 MB | `<repo>/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .` |
| 57684 | workerd | 0.2% | 2.0% | 150.0 MB | `<repo>/node_modules/.bun/@cloudflare+workerd-darwin-arm64@1.20260317.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental ...` |
| 55870 | other | 0.2% | 1.6% | 182.0 MB | `/Users/bichengyu/.nvm/versions/node/v20.18.2/bin/node --no-warnings --experimental-vm-modules <repo>/node_modules/.bun/wrangler@4.78.0+eb149c62096a40af/node_mo...` |
| 72875 | desktop-dev-runner | 0.0% | 0.1% | 2.7 GB | `node <repo>/apps/desktop/node_modules/.bin/electron-vite dev --watch` |
| 57681 | other | 0.0% | 0.1% | 9.8 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.27.3/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.27.3 --ping` |
| 72913 | other | 0.0% | 0.1% | 11.5 MB | `<repo>/node_modules/.bun/@esbuild+darwin-arm64@0.25.12/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.25.12 --ping` |

## Route Measurements

- No routes measured. Pass `--route=/tasks` or another hash route to collect route-open timings.

## Renderer Console Errors

- None

## Notes

- Memory uses macOS `phys_footprint` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus 750 ms of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
