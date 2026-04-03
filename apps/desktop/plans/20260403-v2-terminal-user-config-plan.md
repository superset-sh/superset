# V2 Terminal User Config Wiring Plan

## Goal

Make the v2 terminal honor the existing user-configured terminal theme and font settings, while keeping the rewrite clean:

- no new runtime dependency on Zustand or tRPC
- no importing v1 terminal component logic into v2
- one shared terminal appearance contract for both creation and live updates

## Current Gap

- v2 hardcodes xterm font and theme in `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts`.
- v2 hardcodes the pane background in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`.
- v1 already applies live terminal theme updates from the theme store and live font updates from `settings.getFontSettings` in `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx`.
- theme state already exists in the renderer theme store, and font settings already exist in the desktop settings router/local DB.

## Plan

1. Extract a shared terminal appearance module under `apps/desktop/src/renderer/lib/terminal/appearance/`.
   - Define a small `TerminalAppearance` shape: `theme`, `background`, `fontFamily`, `fontSize`.
   - Move terminal appearance defaults out of the legacy screen-path config so v2 does not depend on v1 file structure.

2. Add a v2-only `useTerminalAppearance` hook near the new pane.
   - Read `useTerminalTheme()` for resolved terminal colors.
   - Read `settings.getFontSettings` for terminal font family and size.
   - Resolve defaults once and return a plain appearance object.

3. Refactor the runtime and registry API to accept appearance explicitly.
   - Create runtime with `createRuntime(terminalId, appearance)`.
   - Add `updateRuntimeAppearance(runtime, appearance)` for live theme/font changes.
   - Update registry attach flow to accept appearance and apply it without recreating the terminal.

4. Remove eager runtime creation from registry subscription paths.
   - `onStateChange()` should not create a runtime as a side effect.
   - Runtime creation should happen on first real attach, using the latest resolved appearance.

5. Wire the v2 pane to the new appearance flow.
   - Pass appearance into registry attach.
   - Push appearance updates when theme or font settings change.
   - Use `appearance.background` for the pane container instead of a hardcoded color.

6. Keep host-service shell theme parity as a separate follow-up.
   - If we want full v1 parity, thread resolved light/dark theme type into the host-service terminal session env so shell/TUI detection matches the UI.
   - Do not mix that with the UI appearance refactor.

## Acceptance Criteria

- New v2 terminal panes open with the current user-selected terminal theme and font settings.
- Changing theme updates existing v2 terminals without remounting them.
- Changing terminal font family or size updates existing v2 terminals and re-fits layout.
- v2 runtime code remains store-agnostic and does not import from the legacy terminal component tree.

## Source

- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts`
  - v2 runtime currently hardcodes xterm theme/font.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`
  - v2 pane currently hardcodes background and only attaches by `terminalId + wsUrl`.
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx`
  - v1 already applies live theme and font updates after terminal creation.
- `apps/desktop/src/renderer/stores/theme/store.ts`
  - resolved terminal theme already exists in the theme store.
- `apps/desktop/src/lib/trpc/routers/settings/index.ts`
  - terminal font settings already exist in the desktop settings router.
- `packages/host-service/src/terminal/terminal.ts`
  - host-service terminal sessions currently do not consume resolved theme type.
