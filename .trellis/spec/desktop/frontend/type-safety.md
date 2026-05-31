# Type Safety

## Rules

- Avoid `any`. Prefer explicit domain types, Zod schemas at boundaries, and narrowed unknowns.
- Share reusable types from the package that owns the domain. Do not copy identical payload types across renderer, host-service, and cloud routers.
- Use discriminated unions for lifecycle/event payloads and branch on stable `type`, `kind`, or `status` fields.
- Keep generated or framework-owned types in their expected locations.
- When changing shared types, search all consumers before editing.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
