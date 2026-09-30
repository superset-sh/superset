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
