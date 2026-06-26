# Workspace Card Widgets — Authoring Guide & Style Chart

LLM-authored TSX widgets render as lines on the sidebar workspace cards. A
widget is a single `.tsx` file under your repo's `.superset/widgets/` directory,
referenced from `.superset/config.json`. This document is the **style chart**
every widget must respect: the contract, the kit API, the design tokens, the
card styling conventions, the link behavior, and the security model.

> Widgets are the third workspace-card line type, alongside `command` (shell
> output) and `component` (built-in app widgets). See
> `apps/desktop/src/shared/workspace-card-config.ts`.

---

## 1. Adding a widget

`.superset/config.json`:

```json
{
  "workspaceCard": {
    "customLines": [
      { "id": "ci", "type": "widget", "file": "widgets/ci.tsx", "label": "CI", "enabled": true }
    ]
  }
}
```

- `id` — unique per line.
- `type` — must be `"widget"`.
- `file` — path **relative to `.superset/`** (canonically `widgets/<name>.tsx`).
  Must be relative, no leading `/`, no `..` segments. Anything else makes the
  whole config fall back to defaults.
- `label` — optional prefix shown before the widget.
- `enabled` — defaults to `true`.

Create the file at `.superset/widgets/ci.tsx`. Widgets **hot-reload** — editing
the file updates the card with no app restart.

---

## 2. Widget contract

A widget module **must default-export a function** named `Widget`:

```tsx
import type { WidgetProps } from "superset/widgets";

export default function Widget({ ctx, kit }: WidgetProps) {
  return <kit.Text>{ctx.branch}</kit.Text>;
}
```

- The default export (or a named `Widget` export) is required; anything else
  renders a red error line.
- You receive exactly two props: `ctx` (read-only snapshot) and `kit` (styled
  primitives + hooks + tokens).
- `React` is in scope automatically — you may use JSX without importing React.
  You **may** still `import * as React from "react"` if you prefer.

### Allowed imports

The renderer's require shim allows **only** these three module specifiers:

| Specifier            | What it gives you                              |
| -------------------- | ---------------------------------------------- |
| `react`              | React (hooks, etc.)                            |
| `react-icons/lu`     | Lucide icon set (`LuGitBranch`, `LuRocket`, …) |
| `superset/widgets`   | The widget kit + types (see below)             |

Importing anything else throws a clear error and the widget shows an error line.

---

## 3. `ctx` shape

A snapshot assembled from data the card renderers already have. Fields are
best-effort — treat everything as possibly `undefined`/`null`.

```ts
interface WidgetContext {
  workspaceId: string;
  projectId: string;
  workspaceName: string;
  branch: string;
  folder?: string;                 // absolute workspace path, when known
  pr?: {
    number?: number;
    title?: string;
    url?: string;
    checks?: "success" | "failure" | "pending" | "none";
    reviewDecision?: string | null;
  } | null;
  linearTicket?: { key: string; state: string; url: string } | null;
  status?: "working" | "permission" | "review" | null;
}
```

---

## 4. Kit API (`superset/widgets`)

You access the kit via the `kit` prop. Import only **types** from
`superset/widgets`.

### Primitives

| Primitive | Props                                                                 | Notes |
| --------- | -------------------------------------------------------------------- | ----- |
| `Row`     | `{ children, className?, title? }`                                    | Flex row, `gap-1.5`, `min-w-0`, vertically centered. Use as the line container. |
| `Text`    | `{ children, muted?=true, truncate?=true, className?, title? }`       | 11px card text. `muted` → `text-muted-foreground`; truncates by default. |
| `Badge`   | `{ children, color?, className?, title? }`                            | Small chip. `color` is a chart palette name (`chart1`…`chart5`); omit for a neutral muted chip. |
| `Button`  | `{ children, onClick?, disabled?, className?, title? }`               | Inline action button (primary tint). Stops click propagation for you. |
| `Link`    | `{ children, href, className?, title? }`                              | See **link behavior** below. |

### Hooks & actions

| Member       | Signature                                                            | Notes |
| ------------ | ------------------------------------------------------------------- | ----- |
| `useCommand` | `(command, { refetchInterval? }?) => { output, error, isLoading }`  | Polls a shell command in the workspace folder; returns the first output line. Same 5s timeout / 200-char cap / 30s cache as command lines. **Must follow React hook rules** (call at the top level of your component, with a stable command). |
| `runCommand` | `(command) => Promise<{ stdout, stderr, exitCode, error }>`          | One-shot run for click actions. Shows a sonner toast with the first output line on success or the error on failure. |
| `tokens`     | typed token map                                                     | See token table below. |

> **Security note:** `useCommand`/`runCommand` accept a command string, but the
> server only runs it after verifying the call originates from a **trusted
> widget line** for the workspace. The widget source (including any command
> strings) is covered by the trust hash, so a trusted widget's commands are as
> trusted as a `command` line.

---

## 5. Design tokens (`kit.tokens`)

Tokens map names to a CSS-var reference (`cssVar`, for inline styles) **and**
Tailwind class hints (`text` / `bg` / `border`). Source of truth:
`packages/ui/src/globals.css`. OKLCH values resolve light/dark automatically.

### Colors — `kit.tokens.colors.<name>`

| Token name          | CSS var                          | Light OKLCH                  | Dark OKLCH                    | Use for |
| ------------------- | -------------------------------- | ---------------------------- | ---------------------------- | ------- |
| `background`        | `--color-background`             | `oklch(1 0 0)`               | `oklch(0.178 0 0)`           | Surfaces (rare on cards) |
| `foreground`        | `--color-foreground`             | `oklch(0.145 0 0)`           | `oklch(0.985 0 0)`           | Primary text |
| `muted`             | `--color-muted`                  | `oklch(0.97 0 0)`            | `oklch(0.269 0 0)`           | Neutral chip backgrounds |
| `mutedForeground`   | `--color-muted-foreground`       | `oklch(0.556 0 0)`           | `oklch(0.708 0 0)`           | **Default card text** |
| `primary`           | `--color-primary`                | `oklch(0.205 0 0)`           | `oklch(0.922 0 0)`           | Actions / links |
| `primaryForeground` | `--color-primary-foreground`     | `oklch(0.985 0 0)`           | `oklch(0.205 0 0)`           | Text on primary |
| `destructive`       | `--color-destructive`            | `oklch(0.577 0.245 27.325)`  | `oklch(0.704 0.191 22.216)`  | Errors / danger |
| `border`            | `--color-border`                 | `oklch(0.922 0 0)`           | `oklch(1 0 0 / 10%)`         | Dividers |
| `sidebar`           | `--color-sidebar`                | `oklch(0.985 0 0)`           | `oklch(0.205 0 0)`           | Sidebar surface |
| `sidebarForeground` | `--color-sidebar-foreground`     | `oklch(0.145 0 0)`           | `oklch(0.985 0 0)`           | Sidebar text |
| `sidebarPrimary`    | `--color-sidebar-primary`        | `oklch(0.205 0 0)`           | `oklch(0.488 0.243 264.376)` | Sidebar accents |
| `sidebarAccent`     | `--color-sidebar-accent`         | `oklch(0.97 0 0)`            | `oklch(0.269 0 0)`           | Sidebar hover |
| `sidebarBorder`     | `--color-sidebar-border`         | `oklch(0.922 0 0)`           | `oklch(1 0 0 / 10%)`         | Sidebar dividers |
| `chart1`            | `--color-chart-1`                | `oklch(0.646 0.222 41.116)`  | `oklch(0.488 0.243 264.376)` | Badge color (orange/indigo) |
| `chart2`            | `--color-chart-2`                | `oklch(0.6 0.118 184.704)`   | `oklch(0.696 0.17 162.48)`   | Badge color (teal/green) |
| `chart3`            | `--color-chart-3`                | `oklch(0.398 0.07 227.392)`  | `oklch(0.769 0.188 70.08)`   | Badge color (blue/amber) |
| `chart4`            | `--color-chart-4`                | `oklch(0.828 0.189 84.429)`  | `oklch(0.627 0.265 303.9)`   | Badge color (yellow/purple) |
| `chart5`            | `--color-chart-5`                | `oklch(0.769 0.188 70.08)`   | `oklch(0.645 0.246 16.439)`  | Badge color (amber/red) |

Each color exposes `{ cssVar, text, bg, border }`, e.g.
`kit.tokens.colors.chart1.text` → `"text-chart-1"`.

### Radius — `kit.tokens.radius.<sm|md|lg>`

| Token | CSS var          | className     |
| ----- | ---------------- | ------------- |
| `sm`  | `--radius-sm`    | `rounded-sm`  |
| `md`  | `--radius-md`    | `rounded-md`  |
| `lg`  | `--radius-lg`    | `rounded-lg`  |

(`--radius` base is `0.625rem`.)

### Typography & spacing

| Token                       | Value                       | Use |
| --------------------------- | --------------------------- | --- |
| `tokens.text.cardLine`      | `text-[11px] leading-tight` | Standard card line |
| `tokens.text.caption`       | `text-[10px] leading-tight` | Secondary metadata |
| `tokens.spacing.rowGap`     | `gap-1.5`                   | Inline item gap |

`tokens.chartColors` lists the five badge palette names.

---

## 6. Card styling conventions

Cards are dense. Respect these or your widget will look off:

- **Font size:** 11px, tight leading (`text-[11px] leading-tight`). The kit
  primitives already apply this.
- **Truncate** long text; never wrap. Card width is narrow.
- **Spacing:** `gap-1.5` between inline items.
- **Muted by default:** secondary text uses `text-muted-foreground`. Reserve
  `foreground`/`primary` for emphasis.
- **One line:** a widget should render a single visual line. Keep it compact.
- **Errors are selectable:** the kit/boundary already add `select-text
  cursor-text` to error text — if you render your own errors, do the same.

---

## 7. Link behavior

`kit.Link` opens URLs the same way the rest of Superset does:

- **Plain click → opens in-app** in a browser pane in that workspace (when the
  user's "open links in app" setting is on).
- **Cmd/Ctrl + click → opens in the external browser.**
- When the in-app setting is off, plain click also opens externally.
- `Link` calls `e.stopPropagation()` so clicking it never selects/activates the
  card row.

Implementation detail: in-app open uses the renderer tabs store
(`openInBrowserPane`); external open uses the `external.openUrl` tRPC mutation
(which validates the URL scheme).

---

## 8. Security model

Widget code is **arbitrary code**, so it carries the same trust gate as
`command` lines:

- Repo-sourced widget lines are **stripped** (render nothing) until the user
  explicitly approves the project's command/widget set in **Project Settings →
  Workspace card**.
- The **trust hash covers the widget file contents**, not just the config entry.
  Editing a `.superset/widgets/*.tsx` file changes its content hash and
  **re-arms** consent — the user must re-approve.
- The renderer never sends a file path to load; it sends a `lineId`, and the
  main process resolves the file from the **trusted, gated config**. Untrusted
  widget lines are absent, so an unknown `lineId` means "not permitted".
- The require shim is an allowlist (`react`, `react-icons/lu`,
  `superset/widgets`); there is no filesystem, `process`, or arbitrary-module
  access in widget scope.
- Widget shell commands (`useCommand`/`runCommand`) run with the same
  constraints as command lines: `/bin/sh -c`, in the workspace folder, 5s
  timeout, 200-char output cap.

---

## 9. Example widgets

### Example A — CI link + status badge

```tsx
import type { WidgetProps } from "superset/widgets";
import { LuCircleCheck, LuCircleX, LuCircleDot } from "react-icons/lu";

export default function Widget({ ctx, kit }: WidgetProps) {
  const pr = ctx.pr;
  if (!pr?.url) return null;

  const checks = pr.checks ?? "none";
  const color =
    checks === "success" ? "chart2" : checks === "failure" ? "chart5" : "chart4";
  const Icon =
    checks === "success" ? LuCircleCheck : checks === "failure" ? LuCircleX : LuCircleDot;

  return (
    <kit.Row title={pr.title}>
      <kit.Link href={pr.url}>
        <Icon className="size-3 shrink-0" />
        PR #{pr.number}
      </kit.Link>
      {checks !== "none" && <kit.Badge color={color}>{checks}</kit.Badge>}
    </kit.Row>
  );
}
```

### Example B — deploy quick-command button

```tsx
import type { WidgetProps } from "superset/widgets";
import { LuRocket } from "react-icons/lu";

export default function Widget({ kit }: WidgetProps) {
  return (
    <kit.Row>
      <kit.Button
        title="Deploy this branch"
        onClick={() => kit.runCommand("npm run deploy:preview")}
      >
        <LuRocket className="size-3 shrink-0" />
        Deploy
      </kit.Button>
    </kit.Row>
  );
}
```

### Example C — branch / latest-commit info line

```tsx
import type { WidgetProps } from "superset/widgets";
import { LuGitBranch } from "react-icons/lu";

export default function Widget({ ctx, kit }: WidgetProps) {
  // Polls the latest commit subject every 60s.
  const last = kit.useCommand("git log -1 --pretty=%s", {
    refetchInterval: 60_000,
  });

  return (
    <kit.Row title={last.output ?? ctx.branch}>
      <LuGitBranch className="size-3 shrink-0 text-muted-foreground" />
      <kit.Text muted={false} className="font-mono shrink-0">
        {ctx.branch}
      </kit.Text>
      {last.output && <kit.Text>· {last.output}</kit.Text>}
    </kit.Row>
  );
}
```
