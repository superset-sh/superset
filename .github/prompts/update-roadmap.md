# Monthly Public Roadmap Sync

You are updating the public roadmap page at `apps/marketing/src/app/roadmap/data.ts` from the internal Notion "Product Roadmap" database. You open a PR; a human reviews and merges. You never publish directly.

## Source of truth

The Notion database "Product Roadmap" (data source `collection://7cbe2be9-46f2-44d6-b883-102eae5918fa`, inside the "Living 12 Month Roadmap" page). Use the Notion MCP tools (`notion-search`, `notion-fetch`, `notion-query-data-sources`). Query all rows with these columns: `Name`, `Status`, `Public`, `Public title`, `Public description`, `Public category`, `date:Date:end`.

## The privacy contract (non-negotiable)

1. **Only rows with `Public` checked may appear in the output.** A row without the checkbox is invisible, no matter how harmless it looks.
2. **Only these four values cross the boundary:** `Public title`, `Public description`, `Public category`, and the lane derived from `Status`. Never copy from `Name`, `Description`, `Success measure`, `Size`, `Owner`, `Linear project`, or dates — those fields contain internal metrics, strategy notes, and ticket IDs.
3. **Never write dates, quarters, or ETAs** for unshipped work. Shipped items get a month label only (see below).
4. If a `Public`-checked row is missing `Public title`, `Public description`, or `Public category`, **do not improvise from internal fields.** Draft a suggestion in the PR description (clearly marked as a draft for review) and leave the item out of `data.ts` until a human fills the Notion field.

## Lane mapping

| Notion `Status` | `data.ts` status |
|---|---|
| In progress | `now` |
| Committed | `next` |
| Proposed | `later` |
| Shipped | `shipped` |
| Not now | omit |

- `shipped` items: include only those shipped in the last ~3 months. `shippedDate` is a month label like `"Aug 2026"` — derive from the row's `date:Date:end` month if present, otherwise the current month.
- `shipped` items may also carry `href` (link to the matching entry under `apps/marketing/content/changelog/`, as `/changelog/<file-slug>`) and `image` (a screenshot path from that entry, e.g. `/changelog/2026-08-02-sidebar-redesign.png`). Both come from already-public changelog content only — never from internal sources. Supplement the Notion-derived shipped lane with the month's major changelog features (title + one-line description rewritten from the entry, image, href) so the lane stays visual; keep the shipped lane to ~8 items.
- **Tag every shipped item when you can:** prefer `href` to the changelog entry. If no entry covers the ship, find the main merged PR with `gh pr list --state merged --search "..."` and set `pr` to its public GitHub URL. If the ship spans many PRs with no clear flagship, leave it untagged rather than picking arbitrarily. Never use Linear links.
- Keep lanes honest, not exhaustive: if `later` exceeds ~14 items, keep the most user-relevant and note the cuts in the PR description.

## Output

Regenerate the `ROADMAP_ITEMS` array in `apps/marketing/src/app/roadmap/data.ts`:

- `id`: kebab-case slug of the public title (stable across runs — reuse existing ids where the item is unchanged).
- `title` and `description` are Lingui message descriptors, not plain strings. Write them as
  `msg({ id: "marketing.roadmap.item.<camelCaseSlug>.title", message: "Public title" })` and
  `msg({ id: "marketing.roadmap.item.<camelCaseSlug>.description", message: "Public description" })`,
  where `<camelCaseSlug>` is the item's `id` in camelCase. Message IDs are permanent: when an item's
  copy changes, edit the `message` and keep the existing ID. Only a genuinely new item gets a new ID.
- `category` = `Public category`, `status` = mapped lane. Both stay raw union values, not descriptors.
- Order within each lane: keep the existing file's order for unchanged items; append new items at the end of their lane.
- Do not change the types, `CATEGORIES`, `CATEGORY_LABELS`, `STATUS_LABELS`, or `STATUS_DESCRIPTIONS` unless a `Public category` value doesn't exist in the union — in that case flag it in the PR description instead of editing types.

## Ship it

1. `bun run lint:fix`, then verify `bun run lint` exits 0.
2. Create a branch `roadmap-sync-YYYY-MM`, commit, and open a PR titled `chore(marketing): monthly public roadmap sync` using `gh`.
3. PR description must include:
   - A summary table of adds / moves / removals (public titles only).
   - Any `Public`-checked rows skipped for missing public fields, with your drafted suggestions.
   - The sentence: "Reviewer: confirm no internal metrics, dates, ticket IDs, or strategy language leaked into descriptions."
4. If nothing changed since the last sync, do not open a PR; just report "no changes".
