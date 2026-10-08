# TODO

## 2026-09-23 09:11 — Weekly docs update

- [ ] Review the committed docs/update-2026-09-23 branch; the commit message contains the PR-by-PR audit.
- [ ] Restore or update the automation’s missing .github/prompts/update-docs.md pointer to the live Notion SOP.

## 2026-09-23 09:28 — Weekly docs update

- [ ] Review the follow-up correctness and trimming commit, including the remote-port and privacy FAQ corrections.

## 2026-09-23 10:41 — Weekly docs update

- [ ] Review the broader trimming pass across onboarding, orchestration, ports, editor, agent status, tasks, and PR guides.

## 2026-09-30 17:45 — Weekly docs update

- [ ] Review branch docs/update-2026-09-30 (commit c0af205d70); the commit message maps each PR to its doc change and lists the skipped PRs.
- [ ] Confirm removing the `superset mcp` CLI section and the skills.mdx "Connected Service Plugins" section. #7776 made plugins/mcp internal and the Plugins page is staff-only, so both documented a gated feature.
- [ ] #7983 (pane error screen) and #7958 (ship controls in the sidebar strip) merged after the 1.33.0 bump. The docs describe them before they are in a release.
- [ ] Pre-existing and not fixed: use-with-ide.mdx and customization.mdx say "Settings → Editor" for the default editor, but no such setting exists in the current settings routes. Verify where the default editor is chosen.

## 2026-10-07 16:01 — Weekly docs update

- [ ] Review branch docs/update-2026-10-07 (commit 9d7d112d): added a "Restore a Workspace" section to workspaces.mdx for PR #8178 (restore deleted/merged workspaces). All other PRs from the last 7 days were either already self-documented, behind a flag (chat-v3/ACP chat, right-pane-area), internal/bugfix with no new documented surface, or outside apps/docs/content/docs/ (marketing, plugin skill files).
- [ ] Notion MCP connector in this workspace only exposed static "docs/*" resources, not the `notion-fetch`/`notion-search` tools the automation SOP calls for (page ID 3b3b9d5b-f616-810d-baca-ca7dd2305259). Could not fetch the live SOP this run — fell back to the instructions embedded in the automation prompt. Please check the Notion MCP connection/permissions.
- [ ] `.github/prompts/update-docs.md`, which the automation prompt calls "a pointer only," does not exist in this repo (checked git history too — never committed). Worth either adding it or updating the automation prompt.
- [ ] Pre-existing gaps noticed but left alone (bigger than this week's diff): `superset browser import-login` has no docs page at all despite PR #8190 adding 13 more supported browsers; there is no public plugins/marketplace catalog page under apps/docs/content/docs/ despite several hosted plugins shipping recently (Neon, PostHog, Google Calendar, Vercel).
