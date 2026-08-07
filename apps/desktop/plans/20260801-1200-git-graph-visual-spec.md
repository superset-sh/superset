# Commit Graph — Visual Spec

Design contract for the `Graph` sidebar tab. Covers lane geometry, the lane colour ramp, ref-badge
treatments, row anatomy at each width, and the empty / loading / truncated states.

Companion to `plans/20260801-commit-graph-sidebar.md` (the implementation plan). This file owns **pixels
and colour**; that file owns data, algorithm, and wiring.

**Status:** signed off. The three open calls — row tint at 6%/9%, badges inline rather than in a
gutter, date always-on at the wide breakpoint — were reviewed against the mock and confirmed. The
components in §8 are landed.

**Ownership:** the files listed in §8 own the presentation. Anything that needs a pixel or a colour
changed goes through this spec, not through a local override at the call site.

---

## 1. Frame

The graph renders inside the v2 workspace sidebar. Real width range is **240–560px**, with the
resize hysteresis at `WorkspaceSidebar.tsx:95`:

```ts
setCompact((prev) => (prev ? width < 280 : width < 260));
```

So `compact` engages below 260px and releases at 280px. Every number below is derived from that
range — this is a sidebar component, not a page component, and it never gets a second column.

Three breakpoints:

| Name | Width | `compact` |
|---|---|---|
| Compact | < 260px | `true` |
| Standard | 260–399px | `false` |
| Wide | ≥ 400px | `false` |

---

## 2. Row geometry

| Token | Standard / Wide | Compact |
|---|---|---|
| Row height | 28px | 24px |
| Ref line height (two-line rows only) | 16px | 14px |
| Two-line row height | 44px | 38px |
| Lane pitch | 14px | 12px |
| Lane centre x | `pitch / 2 + laneIndex * pitch` | same |
| Node radius | 3.5px | 3px |
| Node ring | 1.5px, drawn in the lane colour | same |
| Edge stroke | 1.5px | 1.5px |
| Elbow radius | 6px | 5px |
| Visible lane cap | 6 (Standard), 8 (Wide) | 4 |
| Lane column width | `min(laneCount, cap) * pitch + 4` | same |

At Standard the lane column costs `6 * 14 + 4 = 88px` of 260px. That is the budget ceiling; it is why
the cap is width-derived rather than a constant.

**Overflow.** Beyond the cap, lanes sharing a parent merge into the last visible lane, and a `+N`
chip renders at the right edge of the
lane column. Horizontal scrolling of the lane column is explicitly rejected — it desynchronises from
the subject text.

### Edge kinds

`assignLanes` emits five edge kinds per row. Geometry, with `y0 = 0`, `y1 = rowHeight`,
`yc = rowHeight / 2` (the node's y), `e` = elbow radius, `s = sign(xTo - xFrom)`:

| Kind | Meaning | Path |
|---|---|---|
| `pass` | Lane crosses the row untouched | `M x,y0 V y1` |
| `in-straight` | The commit's own lane, entering from above | `M x,y0 V yc` |
| `in-merge` | Another lane awaiting this commit, closing into the node | `M xFrom,y0 V (yc - e) Q xFrom,yc (xFrom + s·e),yc H xTo` |
| `out-straight` | First parent inherits the lane | `M x,yc V y1` |
| `out-fork` | Extra parent leaves toward another lane | `M xFrom,yc H (xTo - s·e) Q xTo,yc xTo,(yc + e) V y1` |

Note the deliberate asymmetry: **merges descend then bend into the node horizontally; forks leave the
node horizontally then bend down.** That is what distinguishes the two at a 3.5px node, without
relying on the subject text. Both use the same elbow radius, so a fork and the merge that eventually
closes it read as one shape. All paths are `fill: none`, `stroke-linecap: round`.

A parent outside the fetch window emits `out-stub` instead of `out-straight`: a dashed segment from
the node to `0.8 · rowHeight` at 55% opacity. It must render, not throw — it is the normal state of
the last page.

**Node.** Filled with the row background, ringed in the lane colour — a donut, not a dot. Merge
commits (`parents.length > 1`) get a filled node instead, so merges are distinguishable at 3.5px
without relying on the subject text. Root commits (`parents.length === 0`) get a filled node with a
1px outer gap.

---

## 3. Lane colour ramp

`packages/ui/src/globals.css` ships `--chart-1..5` only, and their hues are **not stable across
themes** — light `--chart-1` is orange `oklch(0.646 0.222 41.116)`, dark is blue
`oklch(0.488 0.243 264.376)`. A lane would change colour on a theme switch. So the spec adds a
dedicated ramp.

**Additive only.** Eight new custom properties in `:root` and `.dark`, plus eight `@theme inline`
entries. Nothing existing is touched.

Design rules for the ramp:

1. **Fixed hue per index, identical in both themes.** Lane 3 is green in light and green in dark.
2. **Equal lightness and chroma within a theme.** Lanes are peers; none may shout. This is what makes
   eight colours read as one family instead of a rainbow.
3. **Hues at 45° spacing** on the OKLCH wheel, offset so the trunk (lane 1) is not a warning colour.
4. Values sit inside sRGB at the stated L/C, so no browser gamut-mapping surprises.

```css
:root {
  /* Lane ramp — equal L/C, 45° hue spacing, hue held constant across themes. */
  --graph-lane-1: oklch(0.56 0.125 262); /* indigo — trunk */
  --graph-lane-2: oklch(0.56 0.125 152); /* green */
  --graph-lane-3: oklch(0.56 0.125 25);  /* red */
  --graph-lane-4: oklch(0.56 0.125 197); /* teal */
  --graph-lane-5: oklch(0.56 0.125 307); /* violet */
  --graph-lane-6: oklch(0.56 0.125 71);  /* amber */
  --graph-lane-7: oklch(0.56 0.125 342); /* magenta */
  --graph-lane-8: oklch(0.56 0.125 117); /* olive */
}

.dark {
  --graph-lane-1: oklch(0.75 0.115 262);
  --graph-lane-2: oklch(0.75 0.115 152);
  --graph-lane-3: oklch(0.75 0.115 25);
  --graph-lane-4: oklch(0.75 0.115 197);
  --graph-lane-5: oklch(0.75 0.115 307);
  --graph-lane-6: oklch(0.75 0.115 71);
  --graph-lane-7: oklch(0.75 0.115 342);
  --graph-lane-8: oklch(0.75 0.115 117);
}
```

Index order is deliberately *not* the hue order — adjacent lanes on screen get maximally separated
hues (262 → 152 → 25 → 197), which matters far more than the ramp reading as a gradient when listed.

**Assignment.** Lane colour is `hash(originatingBranchName) % 8`, not `laneIndex % 8`. A lane keeps
its colour when the graph refetches and lane indices shift. Fallback for a lane with no branch name:
`laneIndex % 8`.

**Row tint.** Each row carries a full-bleed wash of its lane's colour:

```css
background: color-mix(in oklch, var(--graph-lane-N) 6%, transparent);        /* light */
background: color-mix(in oklch, var(--graph-lane-N) 9%, transparent);        /* dark */
```

This is the highest-value trick in the row: lane membership stays readable without tracing lines, and it survives lane compression at narrow widths where the lines themselves get
crowded. Reviewed at 28px with eight hues live and confirmed at 6% / 9%; the mock keeps a tint toggle
and strength control if the call is ever revisited. Rows inside a selected range use 2× the alpha.

No hardcoded hex anywhere in the components. Everything routes through these tokens plus the existing
shadcn set.

---

## 4. Ref badges

The lanes are the frame. **The badges are the feature** — the point of this tab is surfacing branches
and worktrees that exist in git but have no open Superset workspace.

So state is encoded in **texture, not only colour**: fill means claimed, dashes mean stale, a strike
means broken. That reads at 260px, survives a colourblind viewer, and does not compete with the lane
ramp for hue.

| `state` | Treatment | Reads as |
|---|---|---|
| `open` | Solid chip, lane-coloured background at 18%, lane-coloured 1px border, foreground text, leading dot filled | Yours, live |
| `detached-worktree` | Transparent, 1px **dashed** border in `--border`, `--muted-foreground` text | On disk, nobody's home |
| `orphan-branch` | Transparent, **no border**, `--muted-foreground` text, 1px dotted underline | A name with nothing checked out |
| `prunable` | Transparent, 1px dashed `--destructive` border, name **struck through**, `--destructive` text | Registered, but the path is gone |
| `merged` | `--muted` background, no border, `--muted-foreground` text at 90% | Landed; safe to forget |
| `null` (remote / tag / HEAD) | Transparent, 1px solid `--border`, `--muted-foreground` text | Plain decoration |

Shared badge metrics: height 16px (compact 14px), padding `0 5px`, `--radius-sm` (6px), font-size 11px
(compact 10px), `font-weight: 500`, monospace for the name.

**Type marks.** Two 10px inline SVG glyphs, no emoji: a branch fork for `branch` / `remote`, a tag
outline for `tag`. `head` gets no glyph — it renders as the literal text `HEAD` in
`--foreground`, `font-weight: 600`. A `remote` badge shows its full shortname including the remote
(`origin/main`); it is never string-stripped, per `scripts/check-git-ref-strings.sh`.

**Truncation.** Names ellipsise at `max-width: 12ch` (compact `8ch`) with the full name in `title`.
`prunable` badges put `pruneReason` in the `title` instead.

**Ordering** within a row, so the eye lands on the same thing every time: `head` → `open` →
`detached-worktree` → `prunable` → `orphan-branch` → `merged` → remote → tag. At most 3 badges
render; the rest collapse into a `+N` chip that lists them in its `title`.

**Badges are inline, not in a gutter.** A left gutter joined to the node by a leader line needs a
~700px graph column; at 260px the gutter would take a third of the width from the subject, and the
leader lines would cross the lanes they are trying to stay clear of. Badges therefore render
**inline, immediately right of the lane column**, before the subject. The subject is what
truncates.

---

## 5. Row anatomy

```
Wide      ≥400px   [ lanes ][ badges ][ subject ······················ ][ hash ][ date ]
Standard  260-399  [ lanes ][ badges ][ subject ······················ ][ hash ]
Compact   <260     [ lanes ][ badges ][ subject ····· ]
```

- **subject** — single line, ellipsised, `--foreground`. Merge commits (`parents.length > 1`) render
  at `--muted-foreground`; they are structure, not work. Controlled by the `muteMerges` prop,
  default on.
- **hash** — 7-char short hash, monospace, `--muted-foreground`, `tabular-nums`, 11px.
- **date** — relative (`3h`, `2d`, `Mar 4`), monospace, `--muted-foreground`, right-aligned,
  `tabular-nums`. **Always on at Wide**, not hover-revealed. *Changed from the plan:* a hover-reveal
  costs a hover state and a layout shift to save 44px that Wide already has, and it makes the column
  unscannable — the one thing a date column is for.
- **author** — dropped at every width. There is no width for it and `CommitDetailPanel` carries it.

Vertical rhythm: the lane SVG, badges, subject, hash and date all centre on the same baseline box.
Nothing in the row may change height on hover or select — height is a function of the row's index
alone, which is what lets `estimateSize` stay measurement-free.

### Two-line ref rows (`twoLineRefs`, off by default)

An opt-in that gives refs their own line above the subject:

```
Two-line   [ lanes ][ badges, untruncated, full width ················· ]
                   [ subject ······················ ][ hash ][ date ]
```

- Only rows that **carry refs** grow. A bare commit stays 28px whatever the toggle says, so the
  virtualizer's estimate is `graphRowHeight({ compact, twoLine: rows[i].commit.refs.length > 0 })`
  — index-based, no measurement pass, and the same function the row renders itself with. Roughly 15%
  of rows carry badges, so the added scroll height is small.
- Badges drop the `max-w-[12ch]` / `max-w-[8ch]` cap (`RefBadge`'s `untrimmed`). The cap exists to
  stop a long branch name eating the subject; on its own line there is no subject to eat. This is the
  point of the feature — `fix/tm–…` and `origin/…` truncate today at every sidebar width.
- No `+N` collapse. The line shows every ref, sorted by the same rank as inline. If they overrun the
  width the line clips rather than wrapping — wrapping would make height a function of measured
  content, and the whole estimate would need a measurement pass.
- **The node tracks the subject, not the row's midpoint.** `GraphLanes` takes a `topOffset` and puts
  the node at `topOffset + rowHeight / 2` while lanes still span the full height, so edges stay
  continuous through the badge line and the node still marks the line the commit actually is.

### Interaction states

| State | Treatment |
|---|---|
| Hover | `--accent` background over the lane tint |
| Selected | `--accent` background + lane tint at 16% + 2px left rail in the row's lane colour, full-bleed |
| Range endpoint (shift-click) | Same as selected |
| Range interior | Lane tint at 16%, no `--accent` |
| Unselected | Lane tint at 9% |
| Keyboard focus | `outline: 2px solid var(--ring); outline-offset: -2px` — inset so it never clips |

**Why selected and range interior share an alpha.** `resolveRowSelection` puts only the two endpoints
in `selectedSet`; the band between them is `lo+1 … hi-1`. Giving the band a stronger tint than the
endpoints made the band outrank its own anchors — measured in light theme at ΔL\* 7.7 for the band
against 5.7 for an endpoint. Equal alphas plus `--accent` on the endpoints alone restores the
ordering by construction, in both themes, with no per-theme tuning: selection is always tint *and*
accent, so it is always strictly brighter than tint alone.

The 9% floor stays under `--accent`'s own contribution (≈8.6 ΔL\* on the dark ground), so an
unselected tinted row never competes with a selected one.

Rows are `<button type="button">` in a `<div role="list">`, so keyboard focus and Enter come free.

---

## 6. Non-row states

- **Loading, no data** — 8 skeleton rows: a lane-width shimmer block plus a subject bar at 60% / 45% /
  70% alternating widths. Only when there is genuinely nothing to show; per `AGENTS.md` rule 11,
  existing rows always render even while `isReady` is false.
- **Empty** — centred, `--muted-foreground`, 12px: **"No commits yet."** / "Commits appear here as
  work lands on any branch in this project." An empty screen is an invitation, not an apology.
- **Error** — inline row at the top, `--destructive` text, with a **Retry** button. States what
  failed: "Couldn't read the commit graph." plus the error message in a `title`.
- **Truncated** — sticky footer row, 24px, `--muted` background, hairline top border:
  **"Showing 500 of 12,431 commits"** with a **Load more** button on the right. Numbers use
  `tabular-nums`. Renders only when `nextCursor !== null`.
- **Scope control** — the header carries the `refScope` select (`Local refs` / the three
  not-yet-implemented scopes, disabled). Persisted per project, so it does not belong in the row spec
  beyond leaving the header 24px.

---

## 7. The seam

```ts
GraphRow   { row, compact, selected, onSelect, onDoubleClick?, laneCap, showDate,
             inRange?, muteMerges?, twoLineRefs? }
GraphLanes { row, compact, laneCap, topOffset? }
RefBadge   { graphRef, compact, laneColor, untrimmed? }
```

Everything added after the freeze is optional and defaults to today's behaviour, so the seam widened
without a single call site changing. `graphRowHeight({ compact, twoLine })` ships beside them as the
one place row height is defined — the row renders with it and the virtualizer estimates with it, so
the two cannot drift.

Three deltas from the seam sketched in the implementation plan, all narrowing rather than widening:

1. `GraphRow` no longer takes `refs` separately — it reads `row.commit.refs`. One source, no way for
   the two to disagree.
2. `GraphLanes` and `RefBadge` take the whole `GraphRowModel` / `GraphRef` rather than destructured
   fields. Adding a field later is then not a signature change.
3. `laneCap` and `showDate` are new, and are the only width-derived inputs. The components never read
   a width themselves; the tab shell measures once and passes `laneCapForWidth(width)` and
   `width >= GRAPH_WIDE_BREAKPOINT` down. That keeps every component pure and the breakpoint logic in
   one file.

**Gotcha for whoever extends these.** `cn` runs tailwind-merge, which reads an arbitrary
`text-[11px]` as a font-size/line-height pair and drops any earlier `leading-*`. Put `leading-none`
*after* the size class or the 16px badges silently grow. Caught by the row test, not by review.

## 8. Files this spec owns

- `apps/desktop/.../WorkspaceSidebar/hooks/useGraphTab/types.ts` — the frozen seam
- `.../hooks/useGraphTab/components/GraphLanes/` — per-row SVG painter
- `.../hooks/useGraphTab/components/GraphRow/` — row layout, states
- `.../hooks/useGraphTab/components/RefBadge/` — badge treatments
- `packages/ui/src/globals.css` — the additive `--graph-lane-1..8` block from §3

Presentational only: no tRPC, no collections, no data fetching, no `useEffect`. Props in, markup out.

## 9. Checked against

Fixtures rendered at 240 / 260 / 320 / 400px in both themes: a linear run, a two-parent merge, a
three-parent octopus, a root commit, a lane freed and reused, a parent outside the window, and all
five ref states on one screen. Topology correctness against `git log --graph --oneline --branches` is
a phase-3 check — with fixtures alone this pass can only verify that the components render what they
are handed, and it claims nothing more.

The two-line variant and the tint-ordering fix are covered the same way: markup tests assert the
badge cap is dropped, the `+N` chip is gone, only ref-carrying rows grow, the lane SVG spans the
taller row with the node pushed down, and the toggle-off render is byte-identical to before. That is
a fixture-level guarantee. Neither has been seen on the running app yet — the light-theme numbers
above come from the §5.3 measurement, which was itself synthetic (CSS-toggled, store route
unexercised).
