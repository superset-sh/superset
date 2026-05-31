# @superset/web Frontend Package Guidelines

## Scope
Main Next.js web app, auth proxy, route groups, agents UI preview, integrations/settings pages, PostHog user identification, and mobile terminal input.

## Source Examples
- `apps/web/src/proxy.ts` handles auth redirects and public route matching with Next 16 proxy.
- `apps/web/src/app/(agents)/components/SessionList/SessionList.tsx` shows route-local component organization.
- `apps/web/src/app/(agents)/utils/getAgentsUiAccess/getAgentsUiAccess.ts` shows server cached feature-flag access.
- `apps/web/src/app/(dashboard-legacy)/components/*` shows legacy dashboard route-local components.

## Local Patterns
- Use App Router route groups and local `components/`, `utils/`, `constants.ts`, and `mock-data.ts` inside the owning route group.
- Use `proxy.ts`, not `middleware.ts`, for auth interception.
- Keep auth redirects and public-route matching in proxy; keep server-only feature checks in cached server helpers.
- Use `@superset/ui` components and Tailwind tokens for shared UI.

## Avoid
- Do not move route-only agents/dashboard components to root `src/components`.
- Do not call PostHog feature flags from client components when server gating is required.
- Do not blank authenticated pages before proxy/session state resolves unless no cached data exists.

## Validation
- `bun --cwd apps/web typecheck`
- `bun --cwd apps/web build` for route/proxy changes when feasible.
