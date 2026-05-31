# @superset/mobile Frontend Package Guidelines

## Scope
Expo React Native app, expo-router route files, screen components, mobile shadcn-style UI, auth, collections, PostHog, and tRPC clients.

## Source Examples
- `apps/mobile/AGENTS.md` defines the route/screen separation rule.
- `apps/mobile/app/(authenticated)/(home)/index.tsx` re-exports `WorkspacesScreen`.
- `apps/mobile/screens/(authenticated)/(home)/workspaces/WorkspacesScreen.tsx` owns UI and state.
- `apps/mobile/screens/(authenticated)/providers/CollectionsProvider/CollectionsProvider.tsx` builds collection context from active organization.
- `apps/mobile/components/ui/*.tsx` contains mobile shadcn-style primitives.

## Local Patterns
- `app/` owns routing, redirects, and layouts. UI/business logic goes under matching `screens/` folders.
- Mirror the route shape under `screens/` and export screens through `index.ts`.
- Keep providers and hooks under `screens/<scope>/providers` or `screens/<scope>/hooks` when they are scope-specific.
- Use mobile `components/ui` primitives; web `@superset/ui` components are not automatically React Native compatible.
- Use TanStack DB cache-first rendering with Electric-backed collections.

## Avoid
- Do not put full screen UI in route files except redirects/layout-only logic.
- Do not import web-only DOM components into mobile screens.
- Do not hide cached collection rows while readiness is false.

## Validation
- `bun --cwd apps/mobile typecheck`
- Run Expo/mobile app locally for navigation or native UI changes.
