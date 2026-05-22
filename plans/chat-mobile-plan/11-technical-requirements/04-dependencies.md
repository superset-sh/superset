# Dependencies

## New dependencies

| Dependency | Version target | Purpose | Docs |
|---|---|---|---|
| `@shopify/flash-list` | `^1.7` (cadra ships 1.7.6) | Message list virtualization | https://shopify.github.io/flash-list/ |
| `@gorhom/bottom-sheet` | `^5` (cadra ships 5.1.6) | Pause-prompt sheets | https://gorhom.dev/react-native-bottom-sheet/ |
| `@10play/tentap-editor` | latest stable | WebView-hosted Tiptap for input parity | https://10play.github.io/10tap-editor/ |
| `lucide-react-native` | matches mobile lucide version | Icon parity with desktop's `lucide-react` | https://lucide.dev/guide/packages/lucide-react-native |
| `react-native-markdown-display` (or alternative) | latest stable | Markdown rendering in assistant messages | https://github.com/iamacup/react-native-markdown-display |
| `expo-notifications` | matches Expo SDK 56 | Push token registration + foreground/background notification handling | https://docs.expo.dev/versions/latest/sdk/notifications/ |
| `@storybook/react-native` | latest stable (v9) | Component testing — isolated UI state development via Storybook under custom root toggle | https://storybookjs.github.io/react-native/docs/intro/getting-started/ |
| `@storybook/addon-ondevice-controls` | matches storybook version | Storybook controls addon for RN | https://storybookjs.github.io/react-native/docs/intro/getting-started/ |
| `@storybook/addon-ondevice-actions` | matches storybook version | Storybook actions addon for RN | https://storybookjs.github.io/react-native/docs/intro/getting-started/ |

## Dev-only dependencies (not in production bundle)

These are gated behind `EXPO_PUBLIC_STORYBOOK=true` and stripped by dead-code elimination when the flag is unset. See `13-testing-strategy.md` for the custom root toggle pattern.

## External tooling (not in package.json)

| Tool | Purpose | Install |
|---|---|---|
| **Maestro** | YAML-based E2E testing — no-code mobile UI automation | `curl -Ls "https://get.maestro.mobile.dev" \| bash` |
| **Bun test** | Unit testing for shared logic (already standard across monorepo) | Built into Bun runtime |

## Already in mobile package.json

These cover most of the supporting infrastructure — no new install needed:

- `@better-auth/expo`, `better-auth` — auth (JWT mint flow will live here)
- `@trpc/client`, `@trpc/react-query` — tRPC client
- `@tanstack/react-query`, `@tanstack/electric-db-collection`, `@tanstack/react-db` — query + Electric sync
- `@electric-sql/client` — Electric Shape protocol
- `@rn-primitives/*` (popover, dialog, collapsible, tooltip, etc.) — primitives for popovers used by composer pickers
- `react-native-reanimated` — Reanimated for streaming-cursor, scroll-back fade, sheet animations
- `expo-router` — navigation; new routes under the **(chat) tab** for NAV-defined surfaces: `(authenticated)/(chat)/_layout.tsx` (tab + Stack root), `(authenticated)/(chat)/index.tsx` (sessions list — UC-NAV-01/02), `(authenticated)/(chat)/[sessionId].tsx` (chat view), `(authenticated)/(chat)/host-picker.tsx` (modal sheet — UC-NAV-03), `(authenticated)/(chat)/new-chat.tsx` (workspace-picker sheet — UC-NAV-04), and `(authenticated)/(chat)/[sessionId]/plan-review/[planId].tsx` (UC-PAUSE-03 pushed route). Workspace details remain in the existing `(home)/workspaces/[id]/...` route tree (out of scope for this PRD).
- `expo-secure-store` — secure JWT storage
- `superjson` — tRPC transformer (matches relay + host-service config)
- `uniwind` — Tailwind for RN (already wired via `apps/mobile/global.css`)
