# Fix desktop Canary URL env validation

## Goal

Packaged Canary desktop builds can crash at renderer startup when NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WEB_URL/NEXT_PUBLIC_ELECTRIC_URL/RELAY_URL are missing or blank in build env. Fix the desktop env handling, validate build, then push and trigger Canary packaging.

## Requirements

- Packaged desktop Canary builds must not crash when GitHub Actions URL secrets are missing or expand to empty strings.
- Desktop renderer/main build-time URL env values with safe defaults should treat blank or whitespace-only inputs as unset.
- Existing local/dev overrides with real URL values must keep working.
- After the fix, push the current branch and trigger desktop Canary packaging.
- Document the local backend service ports the user can map through their router.

## Acceptance Criteria

- [x] `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_ELECTRIC_URL`, and `RELAY_URL` fall back to valid desktop defaults when build env values are blank.
- [x] Desktop compile succeeds with the affected URL env vars set to empty strings.
- [x] Root lint passes.
- [ ] Changes are committed and pushed with the pending performance commits.
- [ ] Canary packaging workflow is triggered after push.

## Notes

- Root cause: GitHub Actions missing secrets can expand to empty strings. Renderer env validation uses direct Zod parsing, so schema defaults only apply to `undefined`, not `""`.
- Fix: desktop Vite env injection now trims values and treats blank strings as unset before applying defaults.
- Validation:
  - `bun test apps/desktop/vite/helpers.test.ts`
  - temporary minimal `.env` with affected URL env vars blank, then `bun run --cwd apps/desktop compile:app`
  - `bun run --cwd apps/desktop typecheck`
  - `bun run lint`
- Local deployable service ports from `.env`:
  - API: `3001` (`API_PORT`)
  - Web: `3000` (`NEXT_PUBLIC_WEB_URL`)
  - Electric proxy: `3012` (`WRANGLER_PORT`)
  - Relay: `3013` (`RELAY_URL`)
  - Raw Electric: `3009` (`LOCAL_ELECTRIC_PORT`, internal/proxy source)
  - Desktop renderer dev server: `3005` (`DESKTOP_VITE_PORT`)
