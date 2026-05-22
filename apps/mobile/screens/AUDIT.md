# App Component Token-Compliance Audit

**Generated:** 2026-05-22 (Path A ember migration verification)
**Scope:** First-party app components in `apps/mobile/screens/**/components/` and `apps/mobile/screens/*/components/`
**Companion doc:** `apps/mobile/components/ui/AUDIT.md` (vendor primitives — separate immutability rule)

This audit covers the 8 live app components used by the mobile app's authenticated and unauthenticated routes. Unlike the vendor `components/ui/*` primitives, **these are first-party code** — token-bypass findings here are fixed in place rather than escalated to upstream.

---

## Audit pass — 2026-05-22

### ✅ Clean (6/8) — no remediation needed

| Component | Reason |
|---|---|
| `AuthenticatedTabBar.tsx` | Pure layout via `StyleSheet.create` (position + height); colors flow through `@superset/tab-bar`. No tokens consumed locally. |
| `TabBarAccessory.tsx` | All colors via `useTheme()` (`theme.foreground`, `theme.mutedForeground`); Tailwind classes (`px-4`, `text-sm`) are token-driven. |
| `OrgDropdown.tsx` | Pure Tailwind composition. Reads `text-muted-foreground`, `text-foreground`, `text-destructive`, `size-9` — all theme-routed. |
| `DevSignInButton.tsx` | Composes vendor `Button` + `Text`. `text-destructive` is the only token reference, correctly used. |
| `OrganizationAvatar.tsx` | All colors via `useTheme()` (`theme.muted`, `theme.mutedForeground`). |
| `OrganizationSwitcherSheet.tsx` | Most colors via `useTheme()`. Has one documented exception below. |

### 🛠 Fixed in this audit (2/8)

#### `OrganizationHeaderButton.tsx` — CRITICAL fix

**Before (line 25):**
```tsx
<ChevronsUpDown size={14} color="hsl(240 5% 64.9%)" />
```

The hex/HSL value `hsl(240 5% 64.9%)` references the OLD cool-neutral palette (HSL 240 hue family) that was removed under Path A. Under the new warm ember theme this rendered as a cool-gray chevron sitting on warm-neutral surfaces — visually wrong even at first paint.

**After:**
```tsx
const theme = useTheme();
// ...
<ChevronsUpDown size={14} color={theme.mutedForeground} />
```

Now resolves to the warm `hsl(15 4% 65%)` from `lib/theme.ts` THEME.dark.mutedForeground. Tracks the theme automatically.

#### `SocialButton.tsx` — MEDIUM fix

**Before:**
```tsx
const colorScheme = useColorScheme();
const iconColor = colorScheme === "dark" ? "white" : "black";
```

Two problems:
1. **Hardcoded `white`/`black` literals** — bypass the token system entirely.
2. **`useColorScheme()` reads the OS appearance setting**, not our Uniwind theme. Since `Uniwind.setTheme("dark")` is called unconditionally in `screens/RootLayout/RootLayout.tsx`, the SocialButton icon could disagree with the active theme if a user has light-mode iOS but the app is forced dark — the icon would render black-on-dark, illegible.

**After:**
```tsx
const theme = useTheme();
const iconColor = theme.foreground;
```

Now `iconColor` tracks the active Uniwind theme via the THEME object. Tokenized.

### 📋 Documented exceptions (kept as-is)

#### `SocialButton.tsx` Google icon brand colors

```tsx
<Path d="..." fill="#4285F4" />  {/* Google blue */}
<Path d="..." fill="#34A853" />  {/* Google green */}
<Path d="..." fill="#FBBC05" />  {/* Google yellow */}
<Path d="..." fill="#EA4335" />  {/* Google red */}
```

**Decision:** keep. These are official Google brand colors per [Google's branding guidelines](https://about.google/brand-resource-center/) — recoloring would violate brand requirements. Pinned hex literals are the correct treatment for branded assets.

#### `OrganizationSwitcherSheet.tsx` forced dark colorScheme

```tsx
modifiers={[
  environment("colorScheme", "dark"),
  presentationDragIndicator("visible"),
  background(theme.background),
]}
```

**Decision:** keep. The SwiftUI `BottomSheet` is wrapped in `environment("colorScheme", "dark")`, forcing dark appearance regardless of system color scheme. This is intentional — the sheet uses the ember dark surface tokens (`theme.background = hsl(13 16% 7%)`) for all themes since `Uniwind.setTheme("dark")` is the app default. Flagging here so it's visible at audit time; revisit if/when the app supports system-driven light/dark switching.

#### Storybook caveat for `OrganizationSwitcherSheet`

The sheet uses `@expo/ui/swift-ui` (`Host`, `BottomSheet`, `Group`, `RNHostView`) — these are **iOS-only SwiftUI bridges**. On Android Emulator inside Storybook, this component will not render meaningfully (the SwiftUI bridge is a no-op). Its story acknowledges this and renders an alternate stub on non-iOS.

---

## Verification surface

All 8 components have `Components/{Name}` Storybook stories at sidecar paths (e.g., `screens/(authenticated)/components/OrgDropdown/OrgDropdown.stories.tsx`). The Storybook glob in `.rnstorybook/main.js` was extended to include `../screens/**/*.stories.?(ts|tsx|js|jsx)` so these stories are picked up.

Use the Storybook walkthrough on iOS Simulator + Android Emulator to verify every component renders correctly under ember.
