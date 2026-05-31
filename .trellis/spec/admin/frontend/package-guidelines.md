# @superset/admin Frontend Package Guidelines

## Scope
Next.js admin dashboard, protected dashboard route group, charts, metric cards, week/time pickers, and PostHog user identification.

## Source Examples
- `apps/admin/src/app/(dashboard)/page.tsx` composes dashboard sections.
- `apps/admin/src/app/(dashboard)/components/MetricCard/MetricCard.tsx` shows local component folder pattern.
- `apps/admin/src/app/(dashboard)/components/*Chart/*Chart.tsx` owns chart components.
- `apps/admin/src/proxy.ts` uses Next 16 proxy for request interception.

## Local Patterns
- Keep dashboard-only components under `src/app/(dashboard)/components/<Component>/<Component>.tsx` plus `index.ts`.
- Use shared `@superset/ui` primitives for common controls before adding local UI.
- Keep global app providers in `src/app/providers.tsx` and app layout in `layout.tsx`.
- Use `proxy.ts`, not `middleware.ts`.

## Avoid
- Do not promote dashboard-only cards/charts to root `src/components`.
- Do not duplicate auth proxy logic from web if a shared pattern applies.

## Validation
- `bun --cwd apps/admin typecheck`
- `bun --cwd apps/admin build` for route/proxy changes when feasible.
