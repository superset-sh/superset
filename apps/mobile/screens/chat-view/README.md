# Chat-view (pixel-perfect Wave 4)

Storybook-only chat-view view layer. Each subfolder under `views/` corresponds
1:1 with a design in `designs/views/02-chat-view/` plus the shared modal /
sheet flows in `designs/views/03-plan-review-modal/` and
`designs/views/shared-overlays/`.

## What lives here

| Path | Purpose |
|---|---|
| `components/ChatView/` | Single composition orchestrator. Header + thread + composer + slot for floating UI, bottom overlay, and full-screen overlay. Every chat-shell view is one configuration of this shell. |
| `views/{ViewName}/` | One folder per design view. Each ships `{ViewName}.tsx` (the composition), `{ViewName}.stories.tsx` (Storybook controls / named stories), and `index.ts` (barrel). |
| `types.ts` | Domain type re-exports — `ApprovalDecision`, `ThinkingLevel`, `PermissionMode`, `ChatThreadItem`, `ComposerProps`, etc. Pulled from the existing organism/molecule prop types so view files have one import surface. |
| `mock-data.ts` | Centralized fixtures (thread items, slash commands, picker sections, ask_user pills, plan markdown). Storybook prep evaluates modules eagerly so this file stays dependency-light (no expo-router, no `useTheme`). |

## Storybook integration

`apps/mobile/.rnstorybook/main.js` adds a **narrow** glob:

```js
"../screens/chat-view/**/*.stories.?(ts|tsx|js|jsx)"
```

The broader `../screens/**` glob stays disabled because other screens
transitively import `expo-router` / `useTheme`, which crash Storybook 9 RN at
prep time (`UnhandledLinkingContext`). Files under `chat-view/` MUST avoid
those imports — every existing file already does.

`storybook.requires.ts` was hand-mirrored to match. Re-running the storybook
generator will regenerate it from `main.js`.

## Storybook hooks pattern

Each story uses two interaction mechanisms:

1. **`argTypes` controls** — for enum-shaped state (`composerState`, `kind`,
   `defaultLevel`, `variant`). Toggle via on-device controls panel.
2. **`useState` inside the view or the story `render` function** — for stateful
   transitions (resolving spinners, pill dismiss, picker selection, copy
   toasts). The view component owns the state so reviewers experience the
   real organism behavior, not a static frame.

## Wireframe ↔ view mapping

See `designs/AUDIT.md §VIEW AUDIT` for the canonical 22-view list. Status:
all 22 built (Wave 4 complete).
