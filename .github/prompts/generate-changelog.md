# Changelog Generation for Release

Generate a new changelog entry for this release based on merged PRs since the previous tag.

The version number is provided at the top of the prompt as `Version: X.Y.Z`.

## Instructions

1. **Find PRs merged since the previous tag**
   - Find the previous `desktop-v*` tag: `git tag --sort=-v:refname -l "desktop-v*" | head -2 | tail -1` to get the second-most-recent tag (alternatively try `git describe --tags --abbrev=0 --match "desktop-v*" HEAD^ 2>/dev/null` if HEAD is the tagged commit)
   - Get the date of that tag: `git log -1 --format=%aI <previous-tag>`
   - Use `gh pr list --state merged --search "merged:>=$(date -d '<tag-date>' +%Y-%m-%d 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%S%z' '<tag-date>' +%Y-%m-%d)" --json number,title,body,url,mergedAt --limit 50` to get all PRs merged since the previous tag
   - Categorize PRs into: **Major features**, **Improvements**, **Bug fixes**
   - Skip PRs that are purely internal (CI/CD, dev tooling, refactors) unless they affect users

2. **Check for existing changelog**
   - Before creating a new file, check if a changelog already exists for this version
   - Use `ls apps/marketing/content/changelog/*-v{VERSION}.mdx` to check for existing files matching the version suffix
   - Match on the version portion only (e.g., `*-vX.Y.Z.mdx`) since the date prefix may differ if a tag was re-pushed
   - If a file for this version already exists, skip creation and report that a changelog already exists

3. **Prioritize content**
   - **Lead with 2-4 major features** - These get their own sections with full descriptions
   - **Group smaller improvements** - Can combine related small changes under one heading
   - **Bug fixes go in a footnote section** - Brief one-liner summaries at the bottom

4. **Create the changelog file**
   - Create a new file at: `apps/marketing/content/changelog/YYYY-MM-DD-vX.Y.Z.mdx`
   - Use today's date and the version for the filename (e.g., `2026-02-16-v0.0.76.mdx`)
   - The slug includes the version number for easy identification

5. **Follow this exact format**:

```mdx
---
title: Brief title highlighting 1-2 main features
date: YYYY-MM-DD
version: X.Y.Z
image: /changelog/IMAGE_PLACEHOLDER.png
---

{/* TODO: Replace header image with actual screenshot */}

## Major Feature Name <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

One or two sentences describing what users can now do. Keep it brief and scannable.

- Key capability one
- Key capability two

## Another Major Feature <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

Brief description of the feature and its benefit to users.

## Improvements

- **Improvement name** - Brief description <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />
- **Another improvement** - Brief description <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

---

**Bug fixes:** Fixed issue with X <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />, resolved Y problem <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />
```

6. **Important formatting rules**
   - Frontmatter (`---`) must be at the very top of the file with no content before it
   - MDX comments (`{/* ... */}`) must come AFTER the frontmatter, not before
   - Include `version: X.Y.Z` in the frontmatter (use the version number provided, without the `v` prefix)
   - Set `image:` in frontmatter to `/changelog/IMAGE_PLACEHOLDER.png` - reviewers will replace this
   - Add TODO comments for features that would benefit from screenshots
   - Use a horizontal rule (`---`) before the bug fixes footnote

7. **Writing style**
   - **Be brief** - Users scan changelogs, they don't read every word
   - **Lead with value** - What can users do now that they couldn't before?
   - **One sentence per feature** - If you need more, use 2-3 bullet points max
   - **Skip implementation details** - Users don't care about internal changes
   - **Combine related small fixes** - Don't give each tiny fix its own section

## Content hierarchy

| PR Type | Treatment |
|---------|-----------|
| New user-facing feature | Own section with heading, 1-2 sentences + bullets |
| Significant improvement | Own section or grouped under "Improvements" |
| Small enhancement | One line under "Improvements" |
| Bug fix | One-liner in footnote section at bottom |
| Internal/refactor | Skip entirely unless user-visible |

## Reference Examples

Read these files to understand the expected format:
- `apps/marketing/content/changelog/2026-01-27-terminal-tab.mdx`
- `apps/marketing/content/changelog/2026-01-20-changes-org-settings.mdx`
- `apps/marketing/content/changelog/2026-01-06-sidebar-workspaces-status.mdx`

## Output

Create exactly one new changelog file. If there are no significant PRs to report or a changelog already exists for this version, do not create a file and report why.
