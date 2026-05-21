---
status: binding
ticket_id: mobile-deps-upgrade
chosen_option: minimum
loc_budget: 50
task_chunks: 1
investigator_specialist: react-native-ui-reviewer
challenger_specialist: code-reviewer
created_at: 2026-05-21
bound_at: 2026-05-21
---

# mobile-deps-upgrade: Expo SDK 56 + Uniwind 1.7 upgrade

## Defect

The mobile app (`apps/mobile/`) is on Expo SDK 55 with outdated dependencies. Expo SDK 56 (beta, stable imminent) and uniwind 1.7.0 are available.

**SDK 56 status**: Beta since May 6, 2026. ~2 week beta period, stable release imminent.

## Reproduction

**Evidence**: `apps/mobile/package.json` on `origin/main` at `5d8766b86` shows:
- `expo@55.0.9` (latest: 56.0.3)
- `react-native@0.83.1` (latest: 0.85.3)
- `uniwind@1.6.1` (latest: 1.7.0)
- `typescript@5.9.3` (SDK 56 requires 6.0.3)
- `@react-navigation/native@7.2.2` (incompatible with expo-router 56)

## Root cause

Maintenance upgrade — all dependencies on SDK 55, one major version behind latest.

## Binding scope (chosen: minimum — Expo + Uniwind P1, others only if required for compatibility)

Upgrade Expo SDK 56 + uniwind 1.7 as P1. Only bump other deps if required by peer dependency constraints from these two. Fix the react-navigation fork breakage as a required migration step.

### Acceptance criteria

- **AC-1**: `expo` at 56.0.3, `uniwind` at 1.7.0, `react-native` at 0.85.3, `react` at 19.2.3, `typescript` at 6.0.3
- **AC-2**: All `expo-*` modules upgraded to SDK 56 compatible versions (see version matrix below)
- **AC-3**: `react-native-*` ecosystem deps bumped only if required by Expo/RN peers: `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-worklets`, `react-native-gesture-handler`
- **AC-4**: `@react-navigation/native` imports migrated to expo-router equivalents in `lib/theme.ts` and `screens/RootLayout/RootLayout.tsx`
- **AC-5**: `bun install` succeeds without peer dependency errors
- **AC-6**: `bun run typecheck` passes
- **AC-7**: `bun run lint` passes
- **AC-8**: App boots in iOS simulator without runtime errors

### Files in scope

- `apps/mobile/package.json` — dependency version updates
- `apps/mobile/lib/theme.ts` — react-navigation theme import migration
- `apps/mobile/screens/RootLayout/RootLayout.tsx` — ThemeProvider import migration
- `apps/mobile/app.config.ts` — if plugin config changes needed for SDK 56

### Out of scope

- `@expo/vector-icons` → `@react-native-vector-icons/*` migration
- `@react-native-async-storage/async-storage` 2.x → 3.x
- `lucide-react-native` upgrade (0.562.0 → 1.16.0)
- `posthog-react-native` upgrade
- EAS build config changes
- Native module code changes
- Gesture handler investigation beyond SDK-compat pairing

### Risks

- **SDK 56 is beta** — may have unresolved issues; stable release expected imminently
- **Gesture handler** 3.0.0-beta.1 → 2.31.2 stable: API surface may differ, existing gesture usage may break
- **TypeScript 6.0** may surface new type errors in existing code
- **react-navigation fork** — expo-router 56 no longer wraps react-navigation; ThemeProvider replacement must work correctly

## Verified Version Matrix (npm registry, 2026-05-21)

### Core (P1 — must upgrade)

| Package | Current | Target |
|---------|---------|--------|
| `expo` | 55.0.9 | **56.0.3** |
| `react-native` | 0.83.1 | **0.85.3** |
| `react` | 19.2.0 | **19.2.3** |
| `typescript` | 5.9.3 | **6.0.3** |
| `uniwind` | 1.6.1 | **1.7.0** |
| `babel-preset-expo` | 55.0.13 | **56.0.11** |

### Expo Modules (required for SDK 56 compat)

| Package | Current | Target |
|---------|---------|--------|
| `expo-application` | 55.0.10 | **56.0.3** |
| `expo-constants` | 55.0.9 | **56.0.14** |
| `expo-crypto` | 55.0.10 | **56.0.3** |
| `expo-device` | 55.0.10 | **56.0.4** |
| `expo-dev-client` | 55.0.19 | **56.0.14** |
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

### RN Ecosystem (only if peer-required)

| Package | Current | Target | Why |
|---------|---------|--------|-----|
| `react-native-reanimated` | 4.2.3 | **4.3.1** | Supports RN 0.81-0.85 |
| `react-native-gesture-handler` | 3.0.0-beta.1 | **2.31.2** | SDK 56 compat; 3.x still beta |
| `react-native-safe-area-context` | 5.6.2 | **5.8.0** | expo-router 56 peer req |
| `react-native-screens` | 4.24.0 | **4.25.2** | expo-router 56 peer req |
| `react-native-svg` | 15.15.1 | **15.15.5** | Patch update |
| `react-native-worklets` | 0.7.2 | **0.8.3** | Reanimated 4.3 compat |
| `@types/react` | 19.2.14 | **latest matching** | RN 0.85.3 peer: ^19.1.1 |

### No change

- `@expo/vector-icons` 15.1.1 (keep explicitly in deps since SDK 56 removes transitive)
- `@rn-primitives/*` 1.4.0
- `tailwindcss`, `tailwind-merge`, `tailwindcss-animate`
- `expo-mcp` 0.2.4
- `@react-native-async-storage/async-storage` 2.2.0
- `lucide-react-native` 0.562.0
- `posthog-react-native` 4.39.0

## Considered alternatives

- **moderate** — SDK 56 + async-storage 3.x + lucide 1.16 + get-random-values 2.0. Rejected: these are lower priority and not required for Expo/uniwind compatibility. Can be done as a separate follow-up.
- **strategic** — Full modernization including vector-icons migration + gesture handler 3.x eval + EAS config. Rejected: too large a blast radius for a dependency upgrade. Vector-icons migration and gesture handler investigation should be separate tickets.

## Scope amendments

(none yet)

## Deferred follow-ups

See `.spec/improvements/mobile-deps-upgrade/follow-ups.md`
