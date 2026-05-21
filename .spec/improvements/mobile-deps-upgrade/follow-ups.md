# Deferred follow-ups — mobile-deps-upgrade

Bigger improvements noticed during investigation but excluded from this upgrade's scope.

## 1. @expo/vector-icons → @react-native-vector-icons/*

SDK 56 deprecates `@expo/vector-icons` in favor of scoped packages. Migration codemod available: `npx @react-native-vector-icons/codemod`. Should be a separate ticket.

## 2. @react-native-async-storage/async-storage 2.x → 3.x

Major version bump available (2.2.0 → 3.1.0). May have API changes. Not required for SDK 56 compat.

## 3. lucide-react-native 0.562.0 → 1.16.0

Large version jump. May have renamed/removed icons. Requires auditing all icon imports.

## 4. posthog-react-native 4.39.0 → 4.45.12

Minor version bumps available. Not required for SDK 56 compat.

## 5. react-native-get-random-values 1.11.0 → 2.0.0

Major version bump available. Not required for SDK 56 compat.

## 6. Gesture handler 3.x investigation

react-native-gesture-handler 3.0.0 is still in beta (beta.4). Once stable, evaluate upgrading from 2.31.2. The current beta was being used — understand why, then decide.

## 7. @react-navigation/native full removal

After the react-navigation fork migration, verify the package can be fully removed from dependencies (not just imports replaced).

## 8. EAS build config update

SDK 56 changes may require EAS build configuration updates. Verify after upgrade.
