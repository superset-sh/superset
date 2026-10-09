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
- **Hermes ships a partial `Intl`.** `lib/intl-polyfills` lists what is missing and what is
  polyfilled. A `@superset/i18n/format` helper that reaches for an API outside that list throws, and
  no mobile screen has an error boundary, so the throw takes the screen down. Add the polyfill, its
  per-locale data, and a case in the polyfill test.
- **Pending and failed are not answers.** A query with no data yet has not said "offline" or
  "empty". Keep loading while it is pending and say you could not check when it failed; Home once
  painted "is offline" on every cold start because presence defaulted to `false`.
- **Verifying in the real app:** on a machine with Xcode, `.agents/skills/mobile-sim-verification/SKILL.md`.
  On a cloud sandbox (no local Xcode/simulator), run `apps/mobile/scripts/eas-dev.sh`; see
  `.agents/skills/mobile-eas-dev/SKILL.md`. The script encodes what was found getting the app running
  on an EAS simulator from a sandbox (2026-10-09), so nobody has to rediscover it:
  - **Builds are matched by fingerprint, not rebuilt per sandbox.** The script installs the finished
    `development-simulator` build whose native fingerprint matches this checkout and builds one only
    when none exists: the first time, or after a *native* change (new native module, Info.plist,
    entitlements, native config). JS/TS changes ship through Metro against the same installed build.
  - **The runtime version must come out the same here and on EAS,** or the build fails at "Configure
    expo-updates". It is a fingerprint of the install and the app config, so `eas.json` pins bun and
    marks every profile with `MOBILE_EAS_BUILD` (which makes `app.config.ts` skip the root `.env`),
    and the script removes `EXPO_PUBLIC_*` from the build and fingerprint commands: a sandbox already
    has the dev values in its shell.
  - **The simulator reaches this machine only through local egress,** and the egress client can only
    start once the session exists. The app's first load therefore always fails; the script loads it
    again when the tunnel is up. A port the app calls must be passed as `--egress-allow`; the script
    reads `$API_PORT` from `.env` rather than assuming a fixed port.
  - **Native Sentry starts only when `EXPO_PUBLIC_SENTRY_DSN_MOBILE` is set.** Native init without a
    DSN crashes the app at launch with a bare SIGSEGV before any JS runs, and the EAS `development`
    environment has no DSN.
  - **Call `agent-device` directly.** Through `eas simulator:exec npx agent-device` each command
    takes about 25 s on a sandbox; installed globally it takes about 1 s.
- **Iterating on a native module?** Build its own pod scheme (`-scheme Composer`), not the app —
  the difference between ~6s and minutes.
