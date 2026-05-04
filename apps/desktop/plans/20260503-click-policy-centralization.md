# Centralize click behavior policy

Status: in-progress (started 2026-05-03)

## Problem

Click handling lives in two parallel, disconnected systems:

**System A — sidebar/inline (hardcoded):**
`utils/getSidebarClickIntent` (plain=select, shift=newTab, mod=editor) +
`utils/clickModifierLabels` (CLICK_HINT_TOOLTIP, SHIFT/MOD_CLICK_LABEL).
Consumers: FilesTab, ChangesFileList/FileRow, DiffFileHeader,
DashboardSidebarPortBadge, FileMenuItems (label only).

**System B — terminal/markdown (settings-driven):**
`hooks/useV2UserPreferences/tiers.ts` (terminalTierFor 3-tier,
inlineTierFor 2-tier) + `useLinkActions` + `LinksSettings`/`LinkTierMapper`
+ `LinkHoverTooltip`. Consumers: TerminalPane, MarkdownEditor.

Duplications:
1. Two ModifierEvent types (MouseEventLike, ModifierClickEvent).
2. Three independent label vocabularies (clickModifierLabels,
   LinkTierMapper.TIER_LABELS, LinkHoverTooltip.label*).
3. Three tooltip presentations of the same idea.
4. Folder click rules duplicated across TerminalPane and LinkHoverTooltip.
5. Sidebar's hardcoded contract is invisible to settings.

## Decision (Option B from chat)

Make the sidebar settings-driven. Single source of truth for vocabulary,
tier resolution, action labels, and hint components. Sidebar surfaces
appear in Settings → Links alongside file/url tiers.

## Vocabulary

**Tiers** (4):
- `plain` — no modifier
- `shift` — shift only *(new — terminal/inline previously folded into plain)*
- `meta` — cmd/ctrl
- `metaShift` — cmd/ctrl + shift

**Actions** (4):
- `null` — do nothing (or show hint)
- `pane` — open in current pane/tab
- `newTab` — open in new tab/pane *(new — sidebar previously hardcoded)*
- `external` — open in external app

## Schema changes

`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`

- Extend `linkActionSchema` with `"newTab"`.
- Extend `linkTierMapSchema` with `shift` field.
- Add `sidebarFileLinks: linkTierMapSchema` to `v2UserPreferencesSchema`.

Defaults preserve current behavior:
- `fileLinks` (terminal/inline): `{ plain: null, shift: null, meta: "pane", metaShift: "external" }`
- `urlLinks`: same
- `sidebarFileLinks`: `{ plain: "pane", shift: "newTab", meta: "external", metaShift: "external" }`

Existing rows validate on read (missing fields populated by zod defaults).

## Module: `apps/desktop/src/renderer/lib/clickPolicy/`

```
clickPolicy/
├── types.ts                      ModifierEvent, Tier, Action, Surface, ResolvedClick
├── tiers.ts                      tierFor(event): Tier (single 4-tier resolver)
├── labels/
│   ├── modifierLabel.ts          isMac-aware "⇧ click" / "⌘ click" / etc
│   ├── actionLabel.ts            "Open in tab" / "Open in editor" / etc — surface aware
│   ├── hint.ts                   buildHint(map, mode): string (auto-derives from bindings)
│   └── constants.ts              UNBOUND_HINT
├── policies/
│   ├── useSidebarFilePolicy.ts   reads sidebarFileLinks → resolve(e): ResolvedClick
│   ├── useTerminalFilePolicy.ts  reads fileLinks (uses shift tier)
│   ├── useTerminalUrlPolicy.ts   reads urlLinks
│   ├── useInlineFilePolicy.ts    reads fileLinks (collapses shift→plain, metaShift→meta)
│   ├── useInlineUrlPolicy.ts     reads urlLinks (same collapse)
│   └── folderPolicy.ts           one place for ⌘-reveal / ⌘⇧-external folder rule
├── components/
│   ├── ClickHint/                <Tooltip> wrapper for normal DOM rows
│   ├── ShadowClickHint/          controlled <Tooltip open> + fixed-position trigger (Pierre)
│   └── LinkHoverHint/            portal+motion (replaces LinkHoverTooltip)
└── index.ts
```

## Migration map

| Caller | Today | After |
|---|---|---|
| FilesTab | CLICK_HINT_TOOLTIP + manual hover overlay + getSidebarClickIntent | `<ShadowClickHint>` + `useSidebarFilePolicy().resolve(e)` |
| ChangesFileList/FileRow | getSidebarClickIntent | `useSidebarFilePolicy().resolve(e)` |
| DiffFileHeader | getSidebarClickIntent + Tooltip + CLICK_HINT_TOOLTIP | `<ClickHint>` + policy hook |
| DashboardSidebarPortBadge | getOpenTargetClickIntent | `useSidebarFilePolicy().resolve(e)` (shared sidebar contract) |
| FileMenuItems | SHIFT_CLICK_LABEL, MOD_CLICK_LABEL | `modifierLabel("shift" / "meta")` |
| LinkTierMapper | hardcoded TIER_LABELS | `modifierLabel(tier)` + `actionLabel(action, surface)`; gain shift row + newTab option |
| LinksSettings | 2 cards | 3 cards (file / url / sidebar) |
| LinkHoverTooltip | own resolution + own labels | replaced by `LinkHoverHint`; takes ResolvedClick from policy |
| TerminalPane | terminalTierFor + getFileAction + folder rules | `useTerminalFilePolicy()` + `folderPolicy` |
| MarkdownEditor | useInlineLinkActions().getUrlAction | `useInlineUrlPolicy()` |

After migration delete:
- `utils/clickModifierLabels/`
- `utils/getSidebarClickIntent/`
- `hooks/useV2UserPreferences/tiers.ts`
- `hooks/useV2UserPreferences/useLinkActions.ts`
- `hooks/usePaneRegistry/.../LinkHoverTooltip/`

## Test plan

- `tiers.test.ts` — table-driven coverage of all 4 tier combos.
- `policies/*.test.ts` — verify settings flow through resolve().
- Settings UI: change values, verify persistence, verify each consumer reflects.
- Manual: file tree plain/shift/meta/metaShift; changes file row; diff header;
  terminal file/url link; markdown link; port badge; folder click in tree
  + folder link in terminal.

## Sequencing

1. Schema changes (non-breaking — additive fields with defaults).
2. clickPolicy module skeleton (types, tiers, labels, components).
3. Policy hooks.
4. Migrate consumers one at a time (verify each still works).
5. Update settings UI (LinkTierMapper + LinksSettings).
6. Delete old modules + run typecheck + tests.
