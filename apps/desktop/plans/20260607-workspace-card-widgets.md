# Plan: LLM-authored TSX widget lines for workspace cards

Date: 2026-06-07
Branch: `feat/workspace-card-widgets` (off `feat/configurable-workspace-cards`)
Status: implemented

## Goal

Add a third workspace-card line type, `widget`, that renders an LLM-authored TSX
file from `.superset/widgets/<name>.tsx`. Widgets render icons/badges/links/
buttons and can poll or run shell commands, all on the dense sidebar cards.
Widget code is arbitrary code, so it reuses the existing command trust gate —
extended so editing a widget file re-arms consent.

## Existing feature this builds on

Configurable workspace cards (commit `d5fcfb97`): `.superset/config.json`
`workspaceCard` block with `command` (shell, trust-gated) and `component`
(hardcoded registry) line types, hot reload via fs.watch, trust opt-in UI.

## Design decisions

1. **Schema** — `widgetCardLineSchema { id, type:"widget", file, label?, enabled }`.
   `file` is zod-validated (relative, no leading `/`, no `..`). Union order puts
   widget/component before command so the loose command shape (defaulted `type`)
   stays the back-compat fallback. `commandSetHash` now folds widget `file`
   references in (rename kept for compatibility with existing callers/tests).

2. **Trust covers widget file contents** — config-only `commandSetHash` is not
   enough: editing a widget body must re-arm trust. Added pure
   `workspaceCardTrustHash(config, fileContents)` (shared, testable) and
   main-process `resolveWorkspaceCardTrustHash(projectId, config)` that reads the
   current widget file contents. `applyCommandGating` gained an optional
   `currentHash` param so the main process passes the content-aware hash while
   the pure shared default stays config-only. Gating now strips both `command`
   and `widget` lines when untrusted; `component` lines still always pass.

3. **Compile in main, eval in renderer** — `workspace-card-widgets.ts` resolves
   the repo path, reads `<repo>/.superset/<file>` with a traversal guard,
   compiles TSX→CJS with sucrase (`["typescript","jsx","imports"]`, classic JSX
   runtime), content-hash caches, and fs.watches `.superset/widgets/` (wired into
   the existing `watchWorkspaceCardConfig` observable). Pure compile + path
   helpers live in `workspace-card-widget-compile.ts` so they're unit-testable
   without Electron imports. tRPC `config.getWidgetModule({projectId,lineId})`
   returns `{ code, hash }` only for trusted widget lines (resolved server-side
   by lineId from the gated config — renderer never sends a path).

4. **Widget command execution** — `card-lines.ts` adds `getWidgetCommandOutput`
   (poll query) and `runWidgetCommand` (one-shot mutation, returns stdout/stderr/
   exitCode). Both verify the lineId is a trusted widget line for the workspace,
   then run with the same `/bin/sh -c`, 5s timeout, 200-char cap as command
   lines. The command string comes from the (trusted, hash-covered) widget
   source, so it's as trusted as a command line.

5. **Renderer kit** — `renderer/lib/widget-kit/`: typed `tokens` (colors/radius/
   text/spacing → CSS var + Tailwind class), primitives `Row/Text/Badge/Button/
   Link` matching card conventions (11px, truncate, gap-1.5, muted-foreground),
   and `useCommand`/`runCommand` hooks. The kit is built per-widget via
   `useWidgetKit(ctx, lineId)` so hooks bind to the right workspace/line.

6. **Link behavior** — investigated in-app open: the renderer tabs store exposes
   `useTabsStore((s) => s.openInBrowserPane)(workspaceId, url)`, a global Zustand
   action used from the legacy sidebar (MergedPortBadge), Terminal, and chat. The
   dashboard sidebar can import it identically. `kit.Link`: plain click →
   in-app pane (gated on the `getOpenLinksInApp` setting, mirroring
   MergedPortBadge); cmd/meta+click → external via `external.openUrl`; falls back
   to external when the in-app setting is off. `e.stopPropagation()` so card rows
   don't activate. **A clean in-app open API exists and is used** — no TODO
   needed.

7. **WidgetLine** — fetches `getWidgetModule`, evaluates via
   `new Function("require","module","exports","React", code)` with a require shim
   allowing only `react` / `react-icons/lu` / `superset/widgets`. `React` is
   injected so widgets need not import it for JSX. Re-evaluates on hash change;
   wrapped in `WidgetErrorBoundary` (red, `select-text cursor-text`, truncated).
   Untrusted widgets render nothing (normal gated state), not an error. Wired
   into `WorkspaceCardLines.tsx`, which both card renderers (legacy
   `WorkspaceListItem` and dashboard `DashboardSidebarExpandedWorkspaceRow`) use,
   so a single insertion covers both paths.

## Files

### Shared / schema
- `src/shared/workspace-card-config.ts` — `widgetCardLineSchema`, widget in
  union/equality, `commandSetHash` folds widgets, `enabledWidgetFiles`,
  `workspaceCardTrustHash`.
- `src/shared/workspace-card-config.test.ts` — widget parse, traversal/abs
  rejection, hash + trust-hash tests.
- `src/shared/workspace-card-trust.test.ts` — widget gating cases + content-hash
  arg.

### Main process
- `src/lib/trpc/routers/config/workspace-card-widget-compile.ts` — pure compile +
  path resolution (+ test).
- `src/lib/trpc/routers/config/workspace-card-widgets.ts` — read/compile/cache/
  watch + trust file-content reads.
- `src/lib/trpc/routers/config/workspace-card-trust.ts` — content-aware hash +
  widget gating.
- `src/lib/trpc/routers/config/config.ts` — `getWidgetModule`, widget watch,
  trust-state/trust-mutation use content hash.
- `src/lib/trpc/routers/workspaces/procedures/card-lines.ts` —
  `getWidgetCommandOutput`, `runWidgetCommand`.

### Renderer
- `src/renderer/lib/widget-kit/` — `tokens.ts`, `types.ts`, `useWidgetKit.tsx`,
  `constants.ts`, `index.ts`.
- `src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/WidgetLine/`
  — `WidgetLine.tsx`, `evaluateWidgetModule.ts`, `WidgetErrorBoundary.tsx`,
  `index.ts`.
- `src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/WorkspaceCardLines.tsx`
  — widget branch + WidgetContext assembly.
- `src/renderer/screens/main/components/WorkspaceCardDialog/WorkspaceCardDialog.tsx`
  — widget row in the list (union narrowing fix).
- `.../WorkspaceCardSettings/WorkspaceCardSettings.tsx` — trust copy mentions
  widgets.
- `src/renderer/hooks/useConfigureCardWithAgent/useConfigureCardWithAgent.ts` —
  rewritten agent prompt.

### Docs / deps
- `apps/desktop/docs/workspace-card-widgets.md` — contract, kit API, token table,
  conventions, link behavior, security model, 3 example widgets.
- `apps/desktop/package.json` — `sucrase` dependency.

## Verification

- `bun run typecheck` — desktop passes.
- `bun test` on the four touched/added test files — pass.
- `bun run lint` — exits 0.
