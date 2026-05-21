---
status: proposal
ticket_id: mobile-deps-upgrade
investigator_specialist: react-native-ui-reviewer
challenger_specialist: code-reviewer
created_at: 2026-05-21
---

# mobile-deps-upgrade: Full dependency upgrade for mobile app

## Defect

The mobile app (`apps/mobile/`) is on Expo SDK 55 with outdated dependencies. Multiple packages have newer versions available, and Expo SDK 56 (beta) is available with significant improvements including RN 0.85, Hermes V1 default, and 40% faster Android cold starts.

**SDK 56 status**: Beta since May 6, 2026. ~2 week beta period, stable release imminent.

## Reproduction

**Evidence**: `apps/mobile/package.json` on `origin/main` at `5d8766b86` shows:
- `expo@55.0.9` (latest: 56.0.3)
- `react-native@0.83.1` (latest: 0.85.3)
- `uniwind@1.6.1` (latest: 1.7.0)
- `typescript@5.9.3` (SDK 56 requires 6.0.3)
- `@react-navigation/native@7.2.2` (incompatible with expo-router 56)

## Root cause

No defect — this is a maintenance upgrade. All dependencies are on SDK 55 which is one major version behind latest.

## Verified Version Matrix (npm registry, 2026-05-21)

### Core Framework

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `expo` | 55.0.9 | **56.0.3** | SDK 56 beta |
| `react-native` | 0.83.1 | **0.85.3** | SDK 56 ships 0.85.2 |
| `react` | 19.2.0 | **19.2.3** | SDK 56 pins 19.2.3 (latest is 19.2.6 but SDK pins this) |
| `typescript` | 5.9.3 | **6.0.3** | SDK 56 requirement |
| `uniwind` | 1.6.1 | **1.7.0** | Latest stable |

### Expo Modules → SDK 56

| Package | Current | Target |
|---------|---------|--------|
| `expo-application` | 55.0.10 | **56.0.3** |
| `expo-constants` | 55.0.9 | **56.0.14** |
| `expo-crypto` | 55.0.10 | **56.0.3** |
| `expo-device` | 55.0.10 | **56.0.4** |
| `expo-file-system` | 55.0.12 | **56.0.7** |
| `expo-glass-effect` | 55.0.8 | **56.0.4** |
| `expo-image` | 55.0.6 | **56.0.8** |
| `expo-linking` | 55.0.9 | **56.0.11** |
| `expo-localization` | 55.0.9 | **56.0.6** |
| `expo-network` | 55.0.9 | **56.0.4** |
| `expo-router` | 55.0.8 | **56.2.5** |
| `expo-secure-store` | 55.0.9 | **56.0.4** |
| `expo-status-bar` | 55.0.4 | **56.0.4** |
| `expo-system-ui` | 55.0.11 | **56.0.5** |
| `expo-web-browser` | 55.0.10 | **56.0.5** |
| `@expo/ui` | 55.0.6 | **56.0.12** |
| `expo-dev-client` | 55.0.19 | **56.0.14** |
| `babel-preset-expo` | 55.0.13 | **56.0.11** |

### React Native Ecosystem

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `react-native-reanimated` | 4.2.3 | **4.3.1** | Supports RN 0.81-0.85 |
| `react-native-gesture-handler` | 3.0.0-beta.1 | **2.31.2** | Downgrade from beta to stable |
| `react-native-safe-area-context` | 5.6.2 | **5.8.0** | |
| `react-native-screens` | 4.24.0 | **4.25.2** | |
| `react-native-svg` | 15.15.1 | **15.15.5** | |
| `react-native-worklets` | 0.7.2 | **0.8.3** | |
| `@react-native-async-storage/async-storage` | 2.2.0 | **3.1.0** | |
| `react-native-get-random-values` | 1.11.0 | **2.0.0** | |

### Other Dependencies

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `posthog-react-native` | 4.39.0 | **4.45.12** | |
| `lucide-react-native` | 0.562.0 | **1.16.0** | |
| `@types/react` | 19.2.14 | **latest** | Match RN 0.85.3 peer: ^19.1.1 |

### No Change Needed

| Package | Version | Reason |
|---------|---------|--------|
| `@expo/vector-icons` | 15.1.1 | Still works (deprecated but functional) |
| `@rn-primitives/*` | 1.4.0 | No SDK 56 versions available |
| `tailwindcss` | 4.2.2 | Already latest |
| `tailwind-merge` | 3.5.0 | Already latest |
| `tailwindcss-animate` | 1.0.7 | Already latest |
| `expo-mcp` | 0.2.4 | Already latest |

## Breaking Changes (SDK 55 → 56)

### CRITICAL: expo-router forks from react-navigation

`expo-router@56` no longer depends on `@react-navigation/*`. The app currently uses:
- `@react-navigation/native` ThemeProvider in `apps/mobile/screens/RootLayout/RootLayout.tsx`
- `@react-navigation/native` DarkTheme/DefaultTheme in `apps/mobile/lib/theme.ts`

**Migration**: Run `npx expo-codemod sdk-56-expo-router-react-navigation-replace app` or manually replace imports with expo-router equivalents.

### TypeScript 6.0.3

SDK 56 requires TypeScript 6. Current: 5.9.3. Potential breaking changes in TS types.

### Minimum platform bumps

- iOS: 15.1 → 16.4 (drops iPhone 7/7+, 6s/6s+, SE 1st gen)
- Xcode: → 26.4 minimum

### Gesture handler downgrade (beta → stable)

`react-native-gesture-handler` goes from 3.0.0-beta.1 to 2.31.2 stable. API surface may differ.

### @expo/vector-icons deprecation

SDK 56 removes `@expo/vector-icons` from `expo`'s transitive deps. Must be explicitly kept or migrated to `@react-native-vector-icons/*`.

### async-storage 2.x → 3.x

Major version bump may have API changes.

---

## Option 1: minimum — SDK 56 core upgrade only

**one_line**: Upgrade Expo to SDK 56 + React Native 0.85 + uniwind 1.7, fix react-navigation fork breakage

**files_in_scope**:
- `apps/mobile/package.json`
- `apps/mobile/lib/theme.ts`
- `apps/mobile/screens/RootLayout/RootLayout.tsx`
- `apps/mobile/app.config.ts` (if plugin changes needed)

**loc_budget**: ~50 lines changed

**acceptance_criteria**:
- AC-1: All dependencies in package.json match the verified version matrix above
- AC-2: `bun install` succeeds without peer dependency warnings
- AC-3: `@react-navigation/native` imports replaced with expo-router equivalents
- AC-4: TypeScript compilation passes (`bun run typecheck`)
- AC-5: Lint passes (`bun run lint`)
- AC-6: App boots in iOS simulator without runtime errors

**out_of_scope**:
- `@expo/vector-icons` → `@react-native-vector-icons/*` migration
- `react-native-gesture-handler` 2.x → 3.x (keeping stable 2.x)
- `@react-native-async-storage/async-storage` 3.x upgrade
- `lucide-react-native` upgrade
- EAS build config changes
- Native module code changes

**risks**:
- Gesture handler 3.0.0-beta.1 → 2.31.2 may break existing gesture usage
- TS 5.9 → 6.0 may surface new type errors in existing code
- SDK 56 is beta — may have unresolved issues

## Option 2: moderate — Full SDK 56 + ecosystem upgrades

**one_line**: SDK 56 + all RN ecosystem upgrades + async-storage 3.x + lucide upgrade + vector-icons migration

**files_in_scope**:
- `apps/mobile/package.json`
- `apps/mobile/lib/theme.ts`
- `apps/mobile/screens/RootLayout/RootLayout.tsx`
- `apps/mobile/app.config.ts`
- All files importing from `@expo/vector-icons` (if migrating)
- All files importing from `lucide-react-native` (API may have changed)
- All files using `@react-native-async-storage/async-storage` (3.x API changes)

**loc_budget**: ~150 lines changed

**acceptance_criteria**:
- AC-1 through AC-6 from minimum
- AC-7: `@react-native-async-storage/async-storage` at 3.1.0 with any API migrations applied
- AC-8: `lucide-react-native` at 1.16.0 with any renamed/removed icons handled
- AC-9: `react-native-get-random-values` at 2.0.0

**out_of_scope**:
- `@expo/vector-icons` → `@react-native-vector-icons/*` migration (keep deprecated package)
- Gesture handler investigation beyond basic testing
- EAS build config changes

**risks**:
- All minimum risks plus:
- async-storage 2→3 may have breaking API changes
- lucide 0.562→1.16 may have removed/renamed icons used in the app

## Option 3: strategic — Full ecosystem modernization

**one_line**: SDK 56 + vector-icons migration + gesture handler 3.x investigation + EAS config update + full dead dependency cleanup

**files_in_scope**:
- `apps/mobile/package.json`
- `apps/mobile/app.config.ts`
- All files in `apps/mobile/` importing from `@expo/vector-icons`
- All files using gestures
- `eas.json` if present
- Any native module config files

**loc_budget**: ~300 lines changed

**acceptance_criteria**:
- AC-1 through AC-9 from moderate
- AC-10: `@expo/vector-icons` replaced with `@react-native-vector-icons/*` scoped packages
- AC-11: Gesture handler evaluated — either on stable 2.31.2 with confirmation it works, or migrated to 3.x pattern if needed
- AC-12: `@react-navigation/native` fully removed from dependencies

**out_of_scope**:
- Feature changes
- UI redesign

**risks**:
- All moderate risks plus:
- Vector icons codemod may not cover all import patterns
- Gesture handler 3.x is still beta — may introduce instability
- Largest blast radius — most files changed

---

## File-overlap pre-flight

No active improvement branches touch `apps/mobile/package.json`. No sprint branches detected with mobile dependency changes.

## Specialist consultation summary

- **react-native-ui-reviewer** (investigator): Verified all version numbers against npm registry. Confirmed SDK 56 beta status. Identified react-navigation fork as critical breaking change.
- **Version verification**: All 40+ dependency versions verified via `npm view` against live registry on 2026-05-21.
- **Expo changelog**: Full SDK 56 beta changelog reviewed at `https://expo.dev/changelog/sdk-56-beta`.
