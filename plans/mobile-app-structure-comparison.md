# Mobile App Structure Comparison

This document compares the organizational patterns between the Cadra mobile app (reference monorepo) and the Superset mobile app to understand best practices for Expo Router + screens/ colocation.

## Overview

Both apps follow a **screens/ directory pattern** that mirrors the app/ routing structure 1:1, but with a critical difference in what stays in `app/` vs what goes to `screens/`.

---

## Directory Structure

### Cadra (Reference Monorepo)
```
apps/mobile/
├── src/                              # Source root
│   ├── app/                          # Expo Router - ROUTING LOGIC ONLY
│   │   ├── _layout.tsx              # Root providers & navigation config (STAYS HERE)
│   │   ├── index.tsx                # Redirect logic only (STAYS HERE)
│   │   └── (tabs)/
│   │       ├── _layout.tsx          # Tab navigation config (STAYS HERE)
│   │       ├── chat/
│   │       │   ├── _layout.tsx      # Stack navigation config (STAYS HERE)
│   │       │   ├── index.tsx        # exports from screens/ (ROUTING ONLY)
│   │       │   ├── new.tsx          # exports from screens/ (ROUTING ONLY)
│   │       │   └── [id].tsx         # exports from screens/ (ROUTING ONLY)
│   │       └── today/
│   │           └── index.tsx        # exports from screens/ (ROUTING ONLY)
│   │
│   ├── screens/                     # BUSINESS LOGIC & UI
│   │   ├── (tabs)/
│   │   │   ├── chat/
│   │   │   │   ├── chats/
│   │   │   │   │   └── ChatListScreen/
│   │   │   │   │       ├── ChatListScreen.tsx
│   │   │   │   │       ├── index.ts
│   │   │   │   │       └── components/      # Colocated components
│   │   │   │   │           └── ChatItem/
│   │   │   │   │               ├── ChatItem.tsx
│   │   │   │   │               ├── index.ts
│   │   │   │   │               └── components/
│   │   │   │   │                   └── ChatItemRightActions/
│   │   │   │   │                       ├── ChatItemRightActions.tsx
│   │   │   │   │                       └── index.ts
│   │   │   │   ├── new/
│   │   │   │   │   ├── NewChatScreen.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── ChatScreen.tsx
│   │   │   │       └── index.ts
│   │   │   └── today/
│   │   │       └── index/
│   │   │           ├── TodayScreen.tsx
│   │   │           └── index.ts
│   │   └── components/              # Shared screen components
│   │       ├── OfflineScreen/
│   │       └── PosthogTracker/
│   │
│   ├── components/                  # Global UI components
│   ├── hooks/                       # Shared hooks
│   ├── providers/                   # Context providers
│   ├── stores/                      # State management
│   ├── utils/                       # Utility functions
│   └── globals.css
```

### Superset (Current Implementation)
```
apps/mobile/
├── app/                             # Expo Router - RE-EXPORTS ONLY
│   ├── _layout.tsx                  # export { default } from "@/screens/RootLayout"
│   ├── index.tsx                    # export { default } from "@/screens/index"
│   └── (auth)/
│       └── sign-in.tsx              # export { default } from "@/screens/(auth)/sign-in"
│
├── screens/                         # ALL LOGIC (routing + business)
│   ├── RootLayout/
│   │   ├── RootLayout.tsx           # Root providers & navigation config
│   │   └── index.ts
│   ├── index/
│   │   ├── HomeScreen.tsx           # Business logic + redirects
│   │   └── index.ts
│   └── (auth)/
│       └── sign-in/
│           ├── SignInScreen.tsx
│           └── index.ts
│
├── components/                      # Global UI components
├── lib/                             # Libraries & utilities
├── providers/                       # Context providers
└── global.css
```

---

## Key Differences

| Aspect | Cadra Pattern | Superset Pattern |
|--------|---------------|------------------|
| **Source Root** | `src/` directory | No `src/`, directly in `apps/mobile/` |
| **Routing Logic** | Stays in `app/` (_layout.tsx, redirects) | Moves to `screens/`, `app/` just re-exports |
| **Navigation Config** | `_layout.tsx` stays in `app/` | `_layout.tsx` moves to `screens/RootLayout/` |
| **Screen Components** | Exported from `screens/` via `export default ScreenComponent;` | Exported from `screens/` via barrel exports `export { default } from "@/screens/..."` |
| **Colocation** | Both use `components/` subdirectories | Both use `components/` subdirectories |
| **Barrel Exports** | Named exports: `export { ChatScreen } from './ChatScreen';` | Default exports with barrel: `export { default } from "./Screen";` |

---

## Example Patterns

### Pattern 1: Simple Route (No Logic)

**Cadra:**
```tsx
// app/(tabs)/chat/new.tsx
import { NewChatScreen } from '@/screens/(tabs)/chat/new';

export default NewChatScreen;
```

**Superset:**
```tsx
// app/(auth)/sign-in.tsx
export { default } from "@/screens/(auth)/sign-in";
```

✅ **Both patterns:** Route file just exports the screen component

---

### Pattern 2: Root Layout with Providers

**Cadra:**
```tsx
// app/_layout.tsx - STAYS IN APP/
import '../globals.css';
import { Stack } from 'expo-router';
import { ClerkProvider } from '@clerk/clerk-expo';
// ... other providers

export default function RootLayout() {
  return (
    <PostHogProvider>
      <QueryProvider>
        <ThemeProvider>
          <ClerkProvider>
            <ApiClientProvider>
              <Stack screenOptions={{ headerShown: false }} />
              <PortalHost />
              <Toaster />
            </ApiClientProvider>
          </ClerkProvider>
        </ThemeProvider>
      </QueryProvider>
    </PostHogProvider>
  );
}
```

**Superset:**
```tsx
// app/_layout.tsx - RE-EXPORTS FROM SCREENS/
export { default } from "@/screens/RootLayout";

// screens/RootLayout/RootLayout.tsx - ACTUAL IMPLEMENTATION
import "../../global.css";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// ... implementation
```

⚠️ **Key Difference:** Cadra keeps root layout in `app/`, Superset moves it to `screens/`

---

### Pattern 3: Index Route with Redirect Logic

**Cadra:**
```tsx
// app/index.tsx - STAYS IN APP/ (routing logic)
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useCurrentUser } from '@cadra/queries';

export default function RootIndex() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: user, isLoading } = useCurrentUser(client);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href='/(auth)/sign-in' />;
  if (isLoading) return null;
  if (user?.deletedAt) return <Redirect href='/account-deleted' />;
  if (!user?.isOnboarded) return <Redirect href='/(onboarding)/welcome' />;

  return <Redirect href='/(tabs)/today' />;
}
```

**Superset:**
```tsx
// app/index.tsx - RE-EXPORTS FROM SCREENS/
export { default } from "@/screens/index";

// screens/index/HomeScreen.tsx - REDIRECT LOGIC + UI
import { Redirect } from "expo-router";
import { useSession } from "@/lib/auth/client";

export default function HomeScreen() {
  const { data: session } = useSession();

  // Redirect to sign in if not authenticated
  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <ScrollView className="flex-1 bg-background">
      {/* UI content */}
    </ScrollView>
  );
}
```

⚠️ **Key Difference:** Cadra keeps redirect-only routes in `app/`, Superset moves them to `screens/`

---

### Pattern 4: Navigation Layout (_layout.tsx)

**Cadra:**
```tsx
// app/(tabs)/_layout.tsx - STAYS IN APP/ (navigation config)
import { Tabs } from 'expo-router';
import { lime, neutral } from 'tailwindcss/colors';
// ... icon imports

export default function Layout() {
  // Redirect logic
  if (!isSignedIn) return <Redirect href={'/(auth)/sign-in'} />;

  return (
    <BottomSheetModalProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: lime[500],
        }}
      >
        <Tabs.Screen
          name='today'
          options={{
            title: 'Today',
            tabBarIcon: ({ color, size }) => <Sun color={color} size={size} />,
          }}
        />
        <Tabs.Screen name='chat' options={{ title: 'Chat' }} />
        <Tabs.Screen name='feed' options={{ title: 'Feed' }} />
      </Tabs>
    </BottomSheetModalProvider>
  );
}
```

**Superset:**
```tsx
// If we had tabs, following Superset pattern:
// app/(tabs)/_layout.tsx - RE-EXPORTS FROM SCREENS/
export { default } from "@/screens/(tabs)/TabsLayout";

// screens/(tabs)/TabsLayout/TabsLayout.tsx - NAVIGATION CONFIG
import { Tabs } from 'expo-router';
// ... implementation in screens/
```

⚠️ **Key Difference:** Cadra keeps `_layout.tsx` in `app/` for navigation config, Superset would move to `screens/`

---

### Pattern 5: Component Colocation

**Both Cadra & Superset use the SAME pattern:**

```
screens/SomeScreen/
├── SomeScreen.tsx
├── index.ts
└── components/                    # Components used ONLY by SomeScreen
    ├── SomeComponent/
    │   ├── SomeComponent.tsx
    │   ├── index.ts
    │   └── components/            # Nested components
    │       └── NestedComponent/
    │           ├── NestedComponent.tsx
    │           └── index.ts
    └── AnotherComponent/
        ├── AnotherComponent.tsx
        └── index.ts
```

✅ **Both patterns:** Deep colocation with `components/` subdirectories at every level

---

## Recommendations

### What Cadra Does Better
1. **Clear separation of concerns**: `app/` = routing/navigation, `screens/` = business logic
2. **Easier to understand Expo Router flow**: Navigation config lives where Expo expects it
3. **Less magic**: No need to trace re-exports to find actual layout implementation

### What Superset Does Better
1. **More consistent**: Everything related to a screen lives in `screens/`
2. **Better colocation**: Even root layout can have colocated utilities/components
3. **Simpler app/ directory**: Just a thin routing layer

### Recommended Hybrid Approach (Best of Both)

```
app/
├── _layout.tsx                    # KEEP IN APP/ - root providers & navigation
├── index.tsx                      # KEEP IN APP/ - redirect-only routes
└── (tabs)/
    ├── _layout.tsx                # KEEP IN APP/ - tab/stack navigation config
    └── chat/
        ├── _layout.tsx            # KEEP IN APP/ - nested navigation config
        ├── index.tsx              # EXPORT FROM SCREENS/ - has UI
        ├── new.tsx                # EXPORT FROM SCREENS/ - has UI
        └── [id].tsx               # EXPORT FROM SCREENS/ - has UI

screens/
└── (tabs)/
    └── chat/
        ├── chats/
        │   └── ChatListScreen/
        │       ├── ChatListScreen.tsx
        │       ├── index.ts
        │       └── components/
        ├── new/
        │   ├── NewChatScreen.tsx
        │   └── index.ts
        └── [id]/
            ├── ChatScreen.tsx
            └── index.ts
```

**Rules:**
1. **Keep in app/**: `_layout.tsx` files (navigation config), redirect-only `index.tsx` files
2. **Move to screens/**: Any route with UI components
3. **Always colocate**: Use `components/` subdirectories for screen-specific components
4. **Barrel exports**: Use `index.ts` for clean imports

---

## Migration Path

To migrate Superset to follow Cadra's pattern:

1. **Move `screens/RootLayout/` back to `app/_layout.tsx`**
   - Root layout with providers belongs in `app/`
   - Simplifies understanding of app initialization

2. **Move redirect-only routes to `app/`**
   - If `screens/index/HomeScreen.tsx` only contains redirect logic, move to `app/index.tsx`
   - If it has UI, keep in `screens/`

3. **Create `_layout.tsx` files in `app/` for navigation**
   - Tab navigation config
   - Stack navigation config
   - Any Expo Router-specific navigation setup

4. **Keep UI screens in `screens/`**
   - Any route file with actual UI components
   - Use barrel exports from `app/` routes: `export { default } from "@/screens/..."`

---

## Similarities

Both apps share these patterns:

1. ✅ **screens/ mirrors app/ structure 1:1** - Exact directory hierarchy
2. ✅ **Deep component colocation** - `components/` subdirectories at every level
3. ✅ **One component per file** - Never multiple JSX components in one file
4. ✅ **Barrel exports** - Every component has `index.ts`
5. ✅ **PascalCase naming** - Component folders and files use PascalCase
6. ✅ **Shared UI components** - Global `components/` directory for reusable components
7. ✅ **Monorepo structure** - Turborepo with shared packages
8. ✅ **TypeScript strict mode** - Full type safety

---

## Tech Stack Comparison

| Technology | Cadra | Superset |
|------------|-------|----------|
| **Package Manager** | pnpm | bun |
| **Monorepo Tool** | Turborepo | Turborepo |
| **Auth** | Clerk | better-auth |
| **Styling** | NativeWind (Tailwind v3) | uniwind (Tailwind v4) |
| **UI Components** | Custom base components | Custom base components + shadcn/ui primitives |
| **State Management** | React Query + Context | React Query + Zustand |
| **Database** | Drizzle + Neon PostgreSQL | Drizzle + Neon PostgreSQL |
| **API** | Hono (custom SDK generation) | Next.js API routes |
| **Navigation** | Expo Router | Expo Router |
| **Error Tracking** | Sentry | N/A (not yet implemented) |
| **Analytics** | PostHog | N/A (not yet implemented) |

---

## Conclusion

The key philosophical difference:

- **Cadra**: `app/` owns routing/navigation concerns, `screens/` owns UI/business logic
- **Superset**: `screens/` owns everything, `app/` is just a thin routing proxy

**Best practice**: Follow **Cadra's pattern** for clearer separation of concerns and better alignment with Expo Router's mental model. Keep navigation configuration and redirect-only routes in `app/`, move UI components to `screens/`.
