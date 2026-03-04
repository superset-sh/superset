# Weekly Docs Update

Review recently merged PRs and update documentation to reflect any new features, changed behavior, or removed functionality.

## Instructions

1. **Find PRs merged in the last 7 days**
   - Use `gh pr list --state merged --search "merged:>=$(date -d '7 days ago' +%Y-%m-%d)" --json number,title,body,url,mergedAt,files --limit 50` to get all recently merged PRs
   - For each PR, read the title, body, and changed files to understand what changed

2. **Read the current docs**
   - Read `apps/docs/content/docs/meta.json` to understand the doc structure
   - Read each existing doc page in `apps/docs/content/docs/` to understand current content

3. **Identify docs that need updating**

   For each merged PR, determine if it affects documentation by checking:

   | Change Type | Docs Action |
   |-------------|-------------|
   | New user-facing feature | Add section to relevant doc page, or create new page if it's a major feature area |
   | Changed behavior/UI | Update the relevant doc page to reflect new behavior |
   | New keyboard shortcut | Update `keyboard-shortcuts.mdx` |
   | New terminal feature | Update `terminal-integration.mdx` or `terminal-presets.mdx` |
   | New MCP capability | Update `mcp.mdx` |
   | New agent feature | Update `agent-integration.mdx` |
   | New workspace feature | Update `workspaces.mdx` |
   | Changed port behavior | Update `ports.mdx` |
   | New setup/teardown script feature | Update `setup-teardown-scripts.mdx` |
   | Diff viewer changes | Update `diff-viewer.mdx` |
   | IDE integration changes | Update `use-with-ide.mdx` |
   | Monorepo changes | Update `using-monorepos.mdx` |
   | Customization changes | Update `customization.mdx` |
   | Removed feature | Remove or update the relevant section |
   | Internal-only change (CI, refactor, dev tooling) | **Skip** - no docs update needed |

4. **Skip if nothing needs updating**
   - If no merged PRs require documentation changes, make no edits and report that docs are up to date
   - Do NOT make changes for the sake of making changes - only update docs when PRs genuinely introduced user-facing changes that aren't already documented

5. **Make targeted edits**
   - Edit existing doc files rather than rewriting them
   - Match the writing style and formatting of the existing content
   - Keep changes minimal and focused - only add/update what the PRs changed
   - Preserve all existing content that is still accurate

6. **Creating new doc pages** (rare - only for major new feature areas)
   - Create at `apps/docs/content/docs/slug-name.mdx`
   - Use this frontmatter format:
     ```mdx
     ---
     title: Page Title
     description: Brief description of what this page covers
     ---
     ```
   - Add the new page slug to `apps/docs/content/docs/meta.json` in the appropriate section
   - Follow the style of existing pages - concise, scannable, focused on what users can do

7. **Writing style**
   - **Match existing tone** - The docs are concise and practical, not verbose
   - **Lead with what the user can do** - Not implementation details
   - **Use bullet points** for feature lists
   - **Use headings** (##) to organize sections
   - **Keep sentences short** - One idea per sentence
   - **No fluff** - Skip filler words and marketing language

## Existing doc pages for reference

Read these to match the format and style:
- `apps/docs/content/docs/overview.mdx` - Product overview
- `apps/docs/content/docs/terminal-integration.mdx` - Feature doc example
- `apps/docs/content/docs/keyboard-shortcuts.mdx` - Reference doc example

## Output

Edit the relevant doc files. If no updates are needed, make no changes and report that documentation is already up to date.
