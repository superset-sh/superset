# State Management

## Rules

- Prefer local React state for view-only state.
- Use feature-local providers/stores when state belongs to one route or workflow.
- Use TanStack Query/tRPC for server calls and invalidation.
- Use Electric/TanStack DB collections cache-first: existing rows stay visible while readiness catches up.
- Persisted local settings should use existing package stores/helpers instead of ad hoc localStorage.

## Examples

- `apps/marketing/src/app/page.tsx`
- `apps/marketing/src/app/components/HeroSection/HeroSection.tsx`
- `apps/marketing/src/lib/changelog.ts`
