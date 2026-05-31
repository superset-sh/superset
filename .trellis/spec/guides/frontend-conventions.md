# Frontend Conventions

## Component Organization
- Use one folder per product component: `ComponentName/ComponentName.tsx` plus `index.ts`.
- Co-locate dependencies by usage. If a component is used only by its parent, nest it under the parent's `components/`. Promote to the highest shared parent only when used in multiple places.
- Co-locate local hooks, utils, constants, tests, stories, providers, and stores next to the feature that owns them.
- Keep one component per file except for small private helpers inside the same file, as seen in `AccountSettings` with `SettingRow`.
- `src/components/ui/`, `src/components/ai-elements/`, and mobile `components/ui/` are shadcn-style exceptions: kebab-case single files are intentional for CLI updates.

## Next.js App Router
- Next.js 16 uses `proxy.ts`; never create `middleware.ts`. See `apps/web/src/proxy.ts`, `apps/admin/src/proxy.ts`, and `apps/api/src/proxy.ts`.
- Use route groups and local component folders under `src/app`, as in `apps/web/src/app/(agents)/components/SessionList/SessionList.tsx` and `apps/admin/src/app/(dashboard)/components/MetricCard/MetricCard.tsx`.
- Use server actions in route-local `actions.ts` files when form submission must run on the server. `apps/marketing/src/app/contact/actions.ts` sanitizes, validates, rate-limits, and returns serializable objects.
- Use `cache` for server-only cached helpers, as in `apps/web/src/app/(agents)/utils/getAgentsUiAccess/getAgentsUiAccess.ts`.

## Tailwind And UI
- Use Tailwind utility classes and shared tokens from `@superset/ui`. Merge conditional classes with `cn` from `packages/ui/src/lib/utils.ts`.
- Use `@superset/ui` shadcn components for shared web/desktop UI; add new shadcn components in `packages/ui/` with the shadcn CLI rather than hand-building duplicates.
- Use lucide icons for tool buttons where a matching icon exists.
- Text in desktop error surfaces must remain selectable when users need to copy it. `apps/desktop/AGENTS.md` calls for `select-text cursor-text` because the renderer body disables selection.

## TanStack DB And Electric Live Queries
`useLiveQuery` is cache-first. It can return persisted `data` while a collection is not `isReady`. Render existing rows first; use readiness only to choose the empty/loading branch when there is no data.

```tsx
const { data: rows = [], isReady } = useLiveQuery((q) => q.from({ users: collections.users }), [collections]);
const user = rows.find((row) => row.id === currentUserId);

return !isReady && !user ? <ProfileSkeleton /> : user ? <ProfileForm user={user} /> : <EmptyState />;
```

Use strict readiness for write/seeding side effects unless the write is provably idempotent. Examples: `apps/desktop/src/renderer/routes/_authenticated/settings/account/components/AccountSettings/AccountSettings.tsx`, `apps/desktop/src/renderer/hooks/useCurrentPlan.ts`, and mobile collection setup in `apps/mobile/screens/(authenticated)/providers/CollectionsProvider/CollectionsProvider.tsx`.

## Mobile App Split
- Expo routes in `apps/mobile/app/` own routing, redirects, and layouts.
- UI, hooks, providers, and business logic live under `apps/mobile/screens/`, mirroring the app route shape.
- Route files usually re-export a screen: `apps/mobile/app/(authenticated)/(home)/index.tsx` exports `WorkspacesScreen` from `apps/mobile/screens/(authenticated)/(home)/workspaces`.

## State And Tests
- Use React state for component-local UI, TanStack Query/tRPC for server state, TanStack DB/Electric for synced collections, and Zustand for desktop-only renderer UI state.
- Desktop Zustand stores live in `apps/desktop/src/renderer/stores/`; follow the selector and devtools guidance in `apps/desktop/src/renderer/stores/README.md`.
- Put tests next to the code under test when practical: examples include `packages/ui/src/components/ai-elements/message.test.tsx` and desktop route/store tests.
