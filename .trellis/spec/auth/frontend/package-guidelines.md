# @superset/auth Frontend Package Guidelines

## Scope
Client auth helpers consumed by web, desktop renderer, and mobile surfaces.

## Source Examples
- `packages/auth/src/client.ts` is the client-side export.
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` shows app-side sign-in usage.
- `apps/mobile/lib/auth/client.ts` wraps mobile auth client access.

## Local Patterns
- Import from `@superset/auth/client` for browser/mobile auth clients rather than reaching into server code.
- Keep UI-specific loading state in the app; keep shared auth client configuration in the package.
- Use serializable auth state across route boundaries and keep server redirects in app route code.

## Avoid
- Do not import `@superset/auth/server` into client components.
- Do not duplicate OAuth provider button logic across apps when a shared helper exists.

## Validation
- `bun --cwd packages/auth typecheck`
- Run the consuming app typecheck when changing client exports.
