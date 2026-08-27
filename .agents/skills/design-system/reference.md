# Design system reference

Source of truth for `@superset/ui` conventions and known gaps. This is a living backlog, not a
finished spec — update it as decisions land (starting with the `/design/audit` review) and as new
gaps get found.

## Token table

Defined in `apps/desktop/src/renderer/globals.css` (`:root` = dark/"ember" fallback,
`:root.light` = light fallback), mapped into Tailwind's `--color-*`/`--radius-*` namespace via
`@theme inline`. Match hardcoded colors against these before assuming a new token is needed.

| Tailwind class | CSS variable |
| --- | --- |
| `bg-background` / `text-background` | `--background` |
| `bg-foreground` / `text-foreground` | `--foreground` |
| `bg-card` / `text-card-foreground` | `--card`, `--card-foreground` |
| `bg-popover` / `text-popover-foreground` | `--popover`, `--popover-foreground` |
| `bg-primary` / `text-primary-foreground` | `--primary`, `--primary-foreground` |
| `bg-secondary` / `text-secondary-foreground` | `--secondary`, `--secondary-foreground` |
| `bg-muted` / `text-muted-foreground` | `--muted`, `--muted-foreground` |
| `bg-accent` / `text-accent-foreground` | `--accent`, `--accent-foreground` |
| `bg-tertiary` / `bg-tertiary-active` | `--tertiary`, `--tertiary-active` |
| `bg-destructive` / `text-destructive-foreground` | `--destructive`, `--destructive-foreground` |
| `bg-warning` / `text-warning-foreground` | `--warning`, `--warning-foreground` |
| `border-border` | `--border` |
| `border-input` | `--input` |
| `ring-ring` | `--ring` |
| `bg-chart-1` … `bg-chart-5` | `--chart-1` … `--chart-5` |
| `bg-sidebar*` / `text-sidebar*` / `border-sidebar-border` | `--sidebar*` |
| `bg-highlight` / `text-highlight-foreground` | `--highlight`, `--highlight-foreground` |
| — (used via CSS, not a utility) | `--highlight-match`, `--highlight-active` |
| `bg-fill-hover` / `bg-fill-selected` | `--fill-hover`, `--fill-selected` |
| `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` | derived from `--radius` |

No spacing-scale tokens beyond Tailwind's defaults — spacing isn't part of this audit.

## `packages/ui/src/components/ui/*` conventions

Observed across the 55 shadcn-derived primitives; deviations are called out below rather than
silently followed:

- `cn()` (from `packages/ui/src/lib/utils.ts`) merges every `className`. Only thin Radix
  pass-throughs with nothing to merge (`aspect-ratio.tsx`, `collapsible.tsx`, `sonner.tsx`) skip it.
- `data-slot="<component>"` on every primitive except `sonner.tsx`, `spinner.tsx`.
- `cva()` + `VariantProps<typeof xVariants>` for anything with a real variant enum (button, badge,
  alert, item, field, empty, input-group, button-group, navigation-menu, sidebar, toggle).
  `toggle-group.tsx` correctly reuses `toggleVariants` via context instead of redefining it.
- `asChild` / `Slot` forwarding is reserved for components meant to render as a link/anchor
  (`button.tsx`, `badge.tsx`) — not applied elsewhere, correctly.

## Known deviations (documented, not yet fixed)

- **`input.tsx`** hand-rolls its `variant?: "default" | "ghost"` prop as a plain object instead of
  `cva()`, and isn't typed with `VariantProps<>` like `button.tsx`/`badge.tsx` are. Bring it in line
  with the rest of the variant-bearing primitives.
- **Showcase gaps**: `chart.tsx`, `form.tsx`, and the full `sidebar.tsx` nav-shell aren't demoed
  anywhere on `apps/web/src/app/design` (primitives page). `sidebar-card.tsx` *is* shown, via
  `DataSection.tsx` — only the nav shell itself is missing.

## Promotion-candidate backlog

Tracked today on `/design/superset` → "Shared app components" → Desktop renderer, with import-site
counts. Coupling assessed by reading each implementation:

| Component | Path | Coupling | Verdict |
| --- | --- | --- | --- |
| `PickerTrigger` | `apps/desktop/src/renderer/components/PickerTrigger` | Pure UI — wraps `@superset/ui/button` with `cn()`, no app-specific imports | Ready to promote as-is |
| `AgentSelect` | `.../renderer/components/AgentSelect` | Wraps `@superset/ui/select` cleanly, but hardcodes `useNavigate` (`@tanstack/react-router`) and desktop's preset-icon asset store | Needs navigation/icon-lookup lifted to props before promotion |
| `MarkdownRenderer` | `.../renderer/components/MarkdownRenderer` | Uses `cn()`, but pulls `useMarkdownStyle` from a renderer Zustand store plus a `SelectionContextMenu` subcomponent | Style-config logic is portable; the global-store hook needs to become a prop |
| `ColorSelector` | `.../renderer/components/ColorSelector` | Uses `cn()` and tokens correctly, but imports `PROJECT_COLORS`/`PROJECT_COLOR_DEFAULT` from an app-domain constants file | Needs the palette passed as a prop to become UI-only |

Other candidates on the same list (`HotkeyMenuShortcut`, `ColorSelector`, `HotkeyTooltip`,
`EmojiTextInput`, `ThemeSwatch`, `UpdatesPill`, `OpenInButton`, `AgentModelSelect`,
`MarkdownEditor`) haven't been individually assessed yet — do that before promoting them.

## Usage-drift backlog (found, not yet fixed)

- **Hardcoded color literals**: 40 files in `apps/desktop/src` use a hex/rgb literal instead of a
  token, outside theme/story/test files.
- **Inline styles**: 86 files use `style={{...}}`; many are legitimately dynamic (runtime-computed
  values, CSS properties with no Tailwind equivalent) — each needs a static/dynamic judgment call,
  not a blind rewrite.
- **Standard-component usage variance**: see `/design/audit` — Button usage alone spans ~11 distinct
  visual treatments across canonical-variant-with-override and fully bespoke non-`Button` elements.
  Badge and Input show smaller-scale versions of the same pattern. This is the highest-leverage
  fix, and it's blocked on a human decision (which treatments are canonical) before any migration
  or lint rule can be written — see `/design/audit` and reply with verdicts per bucket.
