# Vendor Primitive Token-Bypass Audit

**Generated:** 2026-05-22
**Scope:** `apps/mobile/components/ui/*.tsx` (28 files)
**Rule reference:** `vendor_components_immutable` constraint in `apps/mobile/design/manifest.json`

This audit catalogs **hardcoded color, opacity, and spacing values** in the vendor `react-native-reusables` primitives that bypass the token system in `apps/mobile/global.css`. Under the **vendor immutable** rule, these are NOT edited locally — the resolution path is an upstream PR to `react-native-reusables` (or a documented divergence accepted on our side).

Listed values render correctly under the ember theme today; they just don't *participate* in the token system, so a future token change (e.g. shadow opacity tuning) won't reach them.

---

## Findings

### 1. `shadow-black/5` and `shadow-black/N` — theme-blind shadows

**Files (24+ instances):**
- `alert-dialog.tsx` (1)
- `button.tsx` (5 — default / destructive / outline / secondary / link variants)
- `card.tsx` (1)
- `checkbox.tsx` (1)
- `context-menu.tsx` (2)
- `dialog.tsx` (1)
- `dropdown-menu.tsx` (2)
- `hover-card.tsx` (1)
- `input.tsx` (1)
- `menubar.tsx` (3)
- `popover.tsx` (1)
- `radio-group.tsx` (1)
- `select.tsx` (2)
- `switch.tsx` (1)
- `tabs.tsx` (1)
- `textarea.tsx` (1)
- `toggle-group.tsx` (1)
- `toggle.tsx` (1)

**Issue:** Tailwind's literal `black` color used at 5% opacity (`shadow-black/5`) regardless of theme. Under our warm-neutral ember dark surface (`#151110`), a 5% black shadow is nearly invisible — the shadow blends into the already-dark page. Under light theme, it works as intended.

**User-visible impact:** Low. Drop shadows in dark mode are subtle to invisible — but rn-reusables design intent is *also* subtle. Net visual delta is small.

**Future-proof fix path:** Replace with a token like `shadow-foreground/5` (uses theme foreground color) or introduce explicit `--color-shadow-soft` / `--color-shadow-overlay` tokens. Either way, the change happens upstream (`react-native-reusables`) — we do NOT patch locally.

### 2. `bg-black/50` — backdrop overlay

**Files (2 instances):**
- `alert-dialog.tsx:32` — modal backdrop
- `dialog.tsx:34` — modal backdrop

**Issue:** Backdrop dim layer hardcoded to 50% black. Theme-blind by design — black backdrop on light theme dims the page to dark-gray; black backdrop on dark theme dims to near-pure-black (the page is already dark, so the dim is subtle).

**User-visible impact:** Acceptable. A black backdrop is the conventional "modal dim" treatment across iOS/Android/web. Our dark-theme dim is *more* aggressive than a light-theme dim, which arguably matches user expectation (dark modals against dark UI need a stronger dim to feel layered).

**Future-proof fix path:** Optional. If we ever want theme-aware backdrops (rare), introduce `--color-backdrop` token.

### 3. `text-white` in destructive variants

**Files (2 instances):**
- `button.tsx:76` — `buttonTextVariants.destructive`
- `badge.tsx:45` — `badgeTextVariants.destructive`

**Issue:** Hardcoded white text on destructive backgrounds. The token `--color-destructive-foreground` is defined in `global.css` as:
- Light: `hsl(0 0% 100%)` (pure white) — `text-white` is identical
- Dark: `hsl(0 100% 90%)` (light pink) — `text-white` is slightly cooler than the warm pink token

**User-visible impact:** Negligible. On dark surfaces, `text-white` vs. `hsl(0 100% 90%)` is indistinguishable to most users.

**Future-proof fix path:** Replace literals with `text-destructive-foreground`. Same conclusion — upstream PR, not a local edit.

---

## Why we don't fix these locally

The `vendor_components_immutable` constraint exists because:

1. **rn-reusables CLI overwrites local edits.** If anyone runs `npx @react-native-reusables/cli@latest add button`, every local tweak to `button.tsx` is silently wiped.
2. **Silent drift defeats the point of vendor-managed components.** The value of using upstream primitives is they stay aligned with upstream. Forking destroys that.
3. **Hand-rolling wrappers around vendor components creates the same problem at one level of indirection.** A `<EmberButton>` that wraps `<Button>` to inject `text-destructive-foreground` is just a slower way to fork.

The right fixes for the above findings:

| Finding | Upstream resolution |
|---|---|
| `shadow-black/5` | Open issue or PR on `react-native-reusables` proposing theme-aware shadow tokens |
| `bg-black/50` | Acceptable as-is; only revisit if a designer flags it |
| `text-white` in destructive | Open PR on `react-native-reusables` replacing with `text-destructive-foreground` |

Until upstream PRs land, these divergences are **acknowledged and accepted** — they don't break ember rendering, they just don't participate in the token system.

---

## Story coverage status

All 28 primitives now have stories under `Components/{Primitive}` (added 2026-05-22) — visually inspectable in Storybook on iOS Simulator + Android Emulator. Use the Storybook walkthrough as the verification surface; flag any visual regression discovered there back into this doc.

---

## Out-of-scope utilities

- **`native-only-animated-view.tsx`** — Utility for native-only animation surfaces. Not a UI primitive; no story written. If it ever becomes user-facing, add a story per workflow rules.
