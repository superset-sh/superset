---
description: Freshly research, add, and refresh marketing compare pages, then open a descriptive PR
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, WebSearch
---

Research and refresh Superset marketing comparison content using current official sources, not stale model memory.

## Input

Parse `$ARGUMENTS` for:
- **Focus** (optional): Specific competitors, pages, or topics to prioritize
- **Plan path** (optional): Use a local compare brief if one exists, otherwise work directly from the current compare inventory and fresh research
- **PR mode** (optional): By default, create or update a PR-ready branch and prepare a PR

## Workflow

### 1. Load the plan and current inventory

1. If a compare brief path is provided, read it first
2. Read the current compare pages under `apps/marketing/content/compare/`
3. Build a quick inventory:
   - existing slugs
   - pages that are obviously stale
   - obvious missing pages suggested by the current market and site positioning

### 2. Do fresh research first

Do not draft from memory. Re-verify current facts before editing.

Research rules:
- Use fresh official sources for every unstable claim:
  - Superset: `superset.sh`, `docs.superset.sh`, Superset changelog, and relevant repo/docs files
  - Competitors: official docs, pricing, changelog, blog, or product pages only
- Record concrete dates when claims depend on current product surfaces, pricing, access, or launch status
- Prefer primary sources over summaries or third-party writeups
- If you cannot verify a claim from an official source, remove it or rewrite it more cautiously
- Do not publish copy about unannounced alpha features
- If repo code suggests future direction that is not publicly announced, label it as inference and keep public copy conservative

### 3. Refresh stale pages, not just net-new pages

After research, audit existing compare pages for stale claims, including:
- outdated product surfaces
- pricing or plan changes
- absolute statements that are no longer true
- Superset being framed too narrowly when the current product includes more surface area
- unsupported claims that should be softened or removed

If a relevant page already exists, update it in the same run instead of only creating new pages.

### 4. Update the marketing content

Make the necessary content changes in `apps/marketing/content/compare/` and related marketing files.

Expect to:
- add new compare or roundup pages when the research supports them
- update stale existing compare pages
- refresh frontmatter such as `lastUpdated`, `keywords`, `competitors`, and descriptions when needed
- keep internal links current
- preserve accurate distinctions between shipped features, public roadmap, and repo-only direction

### 5. Validate before opening a PR

Run the relevant checks and report the exact results:

1. `bun run --cwd apps/marketing typecheck`
2. From `apps/marketing`, verify the compare loader still resolves all compare pages
3. If a full build is attempted and blocked by unrelated environment issues, say so clearly

### 6. Commit and create a descriptive PR

Use a feature branch if needed. Stage only the files relevant to the compare refresh.

When creating the PR:
- follow the repo guidance in `.agents/commands/create-pr.md`
- make the title specific to what changed
- make the body explicitly enumerate:
  - new compare pages added
  - existing stale pages refreshed
  - important Superset positioning changes added to the copy
  - official sources re-verified, with dates when relevant
  - validation run
  - claims removed or softened because they were stale or unverified

Good PR title examples:
- `marketing: refresh compare pages with current Superset chat/browser/MCP positioning`
- `marketing: add new compare pages and re-verify stale competitor comparisons`

Avoid vague titles like:
- `refresh compare pages`
- `marketing updates`

If a PR already exists for the branch, update the branch and produce a refreshed PR body instead of opening a duplicate PR.

## Output

Return a concise summary with:
- pages added
- pages updated
- sources used
- validation results
- PR URL, or the proposed PR title/body if a PR was not opened

$ARGUMENTS
