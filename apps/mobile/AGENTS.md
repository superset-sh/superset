# Superset Mobile App

## Project Structure

Guidelines for organizing the Superset mobile app mostly follow repo's patterns,
with some caveats:

### Keep in app/
1. Any routing related logic i.e. redirects, route guards, etc.

### Move to screens/
1. Any React component logic like providers, hooks, rendering screens etc.
2. Mirror `app/` directory structure exactly, and then import the component in the matching app/ directory

## Examples

### Route with UI (Re-export Pattern)
```tsx
// app/(authenticated)/demo.tsx
import { DemoScreen } from "@/screens/(authenticated)/demo";
export default DemoScreen

// screens/(authenticated)/demo/DemoScreen.tsx
export function DemoScreen() {
  return <ScrollView>...</ScrollView>;
}

// screens/(authenticated)/demo/index.ts
export { DemoScreen } from "./DemoScreen";
```

### Redirect-Only Route (Stays in app/)
```tsx
// app/index.tsx
import { Redirect } from "expo-router";
import { useSession } from "@/lib/auth/client";

export default function Index() {
  const { data: session } = useSession();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(authenticated)" />;
}
```

### Navigation Layout (Stays in app/)
```tsx
// app/(authenticated)/_layout.tsx
import { Stack } from "expo-router";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

export default function AuthenticatedLayout() {
  return (
    <PromptInputProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PromptInputProvider>
  );
}
```

### Key Principle

**Separation of concerns**: `app/` owns routing/navigation, `screens/` owns UI/business logic.

## Conventions

- **`apps/mobile` is iOS-only.** No Android fallbacks or platform guards for iOS-only APIs, and
  Android incompatibility isn't a blocker until Android is explicitly in scope.
- **Bottom sheets are expo-router `formSheet` routes** — `...glassHeaderOptions` gives the native
  title and ✕, the body is RN + uniwind (never `@expo/ui` SwiftUI content, which can't be themed to
  match ours), and the list stays the screen's only layout child or it cold-mounts at zero height.
  Copy `PullRequestsSheet` and its route entry.
