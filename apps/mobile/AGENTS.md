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
  On a cloud sandbox (no local Xcode/simulator), run `apps/mobile/scripts/limrun-dev.sh` — it encodes
  everything below so nobody has to rediscover it. Use `.agents/skills/limrun-expo-development/SKILL.md`
  and `.agents/skills/limrun-xcode/SKILL.md` directly only when the script's flow doesn't fit. Found and
  verified getting mobile sign-in working on a sandbox (2026-10-02):
  - **Builds are shared, not redone per sandbox.** `lim xcode build --upload <name>` puts the built app in
    Limrun's asset storage keyed by bundle id + branch; `lim ios create --install-asset <name>` installs it
    on a fresh simulator with no Xcode sandbox and no build at all (seconds, confirmed). A real Xcode build
    is only needed once per branch, or again after a *native* change (new native module, Info.plist/
    entitlements, native config) — pure JS/TS changes ship through Metro against the same installed shell.
    The script checks for an existing asset by default and only builds when none exists or `--rebuild` is
    passed.
  - **`lim xcode build` fails resolving Swift packages** (`posix_spawn error: Operation not permitted`
    resolving a local SPM manifest, e.g. for `expo-modules-jsi`) unless the sandbox's manifest-loading
    sandbox is disabled first, once per Xcode sandbox *instance*:
    `lim xcode run --id <id> -- 'defaults write com.apple.dt.Xcode IDEPackageSupportDisableManifestSandbox -bool YES && defaults write com.apple.dt.Xcode IDEPackageSupportDisablePluginExecutionSandbox -bool YES'`.
    Confirmed by test (2026-10-02) that this does **not** survive a disk-snapshot publish/restore cycle
    either (`--snapshot-key`/`--snapshot-restore-keys` only covers the synced project workspace, not
    `~/Library/Preferences`) — there is no Limrun-side way to persist it, so the script reapplies it
    unconditionally every time it goes through Xcode, cheap and idempotent.
  - **`.env` never reaches the remote build** — it's gitignored, and Limrun's sync drops gitignored
    paths. Any `EXPO_PUBLIC_*` value a *native* config plugin reads at prebuild time (not a plain JS
    `process.env` read, which Metro inlines locally and ships fine) must go through `lim xcode build --env
    KEY=VALUE` instead, sourced from this box's own `.env`. `EXPO_PUBLIC_SENTRY_DSN_MOBILE` is the one that
    bites first: an empty or missing value makes `@sentry/react-native`'s native init crash the app on
    launch with a bare SIGSEGV before any JS runs, which looks nothing like a Sentry problem. A real DSN is
    now provisioned as an environment secret (flows into `.env` like the other apps' real DSNs already do);
    `.env.local.example` also seeds a syntactically valid placeholder as a fallback where the secret isn't
    set. Either way the script forwards whatever this box's `.env` actually has via `--env` — Limrun never
    sees `.env` directly regardless of which value is in it.
  - **The native project is generated once and reused.** A later `--env` change has no effect until a build
    passes `--expo-force-prebuild`; routine JS-only iteration should skip it (it reinstalls CocoaPods, several
    minutes) — the script only passes it when asked to. Likewise tunnel the API port (`lim ios tunnel
    --selector localhost:8081 --selector localhost:<api-port>`), not just Metro's — the app's own network
    calls need it too; the script reads `$API_PORT` from `.env` rather than assuming a fixed port.
- **Iterating on a native module?** Build its own pod scheme (`-scheme Composer`), not the app —
  the difference between ~6s and minutes.
