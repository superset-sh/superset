# State Management

## Rules

- Prefer local React state for view-only state.
- Use feature-local providers/stores when state belongs to one route or workflow.
- Use TanStack Query/tRPC for server calls and invalidation.
- Use Electric/TanStack DB collections cache-first: existing rows stay visible while readiness catches up.
- Persisted local settings should use existing package stores/helpers instead of ad hoc localStorage.

## Examples

- `apps/mobile/app/(authenticated)/(home)/index.tsx`
- `apps/mobile/screens/(auth)/sign-in/SignInScreen.tsx`
- `apps/mobile/components/ui/button.tsx`
