# Weekly Changelog Generation

Generate a new changelog entry for this week based on merged PRs.

## Instructions

1. **Find PRs merged since last Monday**
   - Use `gh pr list --state merged --search "merged:>=$(date -d 'last monday' +%Y-%m-%d)" --json number,title,body,url,mergedAt --limit 50` to get all PRs merged in the past week
   - Focus on significant PRs (features, improvements, notable fixes)
   - Skip minor PRs like typo fixes, dependency bumps, small refactors, or reverts unless they're user-facing
   - Skip PRs that are purely internal (CI/CD changes, dev tooling) unless they affect users

2. **Check for existing changelog**
   - Before creating a new file, check if a changelog already exists for this week's date
   - Use `ls apps/marketing/content/changelog/` to see existing files
   - If a file for today's date already exists, skip creation and report that a changelog already exists

3. **Extract PR information**
   - For each significant PR, read the description/body
   - Look for the "Summary" section which typically contains bullet points
   - Paraphrase the summary in a user-friendly format
   - Group related PRs under a single heading if they're part of the same feature (e.g., multiple hotkey PRs)

4. **Create the changelog file**
   - Create a new file at: `apps/marketing/content/changelog/YYYY-MM-DD-slug.mdx`
   - Use today's date for the filename (e.g., `2026-01-27-descriptive-slug.mdx`)
   - The slug should summarize the main features (e.g., `terminal-improvements`, `sidebar-workspaces`)

5. **Follow this exact format**:

```mdx
---
title: Brief, descriptive title covering main features
date: YYYY-MM-DD
image: /changelog/IMAGE_PLACEHOLDER.png
---

{/* TODO: Replace header image with actual screenshot */}

## Feature Name <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

- Bullet point describing the change in user-friendly terms
- Another bullet point if needed
- Focus on what users can now do, not implementation details

{/* TODO: Add screenshot showing [specific feature] */}

## Another Feature <PRBadge url="https://github.com/superset-sh/superset/pull/NUMBER" />

Paragraph description for simpler changes. Explain the benefit to users.
```

6. **Important formatting rules**
   - Frontmatter (`---`) must be at the very top of the file with no content before it
   - MDX comments (`{/* ... */}`) must come AFTER the frontmatter, not before
   - Set `image:` in frontmatter to `/changelog/IMAGE_PLACEHOLDER.png` - reviewers will replace this
   - Add TODO comments for the header image and for any features that would benefit from screenshots

7. **Writing style**
   - Write for end users, not developers
   - Focus on benefits and what users can now do
   - Use active voice and present tense
   - Be concise but descriptive
   - Avoid jargon and technical implementation details
   - Keep bullet points short (one line each when possible)

## Reference Examples

Read these files to understand the expected format:
- `apps/marketing/content/changelog/2026-01-27-terminal-tab.mdx`
- `apps/marketing/content/changelog/2026-01-20-changes-org-settings.mdx`
- `apps/marketing/content/changelog/2026-01-06-sidebar-workspaces-status.mdx`

## Output

Create exactly one new changelog file. If there are no significant PRs to report or a changelog already exists for this week, do not create a file and report why.
