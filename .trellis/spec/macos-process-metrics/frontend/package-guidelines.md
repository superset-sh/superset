# @superset/macos-process-metrics Frontend Package Guidelines

## Scope
Optional native Node addon for macOS process metrics consumed by desktop resource monitoring.

## Source Examples
- `packages/macos-process-metrics/src/addon.cc` implements native bindings.
- `packages/macos-process-metrics/index.js` loads the built addon.
- `packages/macos-process-metrics/index.d.ts` exposes TypeScript types.
- `packages/macos-process-metrics/package.json` runs `node-gyp rebuild || echo ...` so non-macOS installs do not fail hard.

## Local Patterns
- Keep the addon optional and macOS-specific; installs on unsupported platforms must degrade gracefully.
- Update `index.d.ts` whenever the native export shape changes.
- Keep desktop consumers prepared for addon unavailability.

## Avoid
- Do not make package install fail on non-macOS CI.
- Do not import this addon into web, mobile, or serverless apps.

## Validation
- Install/build on macOS when native code changes.
- Run desktop resource metrics tests or manual checks for consumers.
