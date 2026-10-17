# [desktop] Bring the polished PR review experience into a freeform pane

## Context

The PR/Changes experience should fit the existing workspace pane system while retaining the visual polish and useful information from the full PR page. The terminal in the reference is a sibling pane; placing another split-pane system inside it misses the intended interaction. The final prototype establishes the review, toolbar, checks, and code presentation to implement.

## References

| Source | Who | Link | Date |
| --- | --- | --- | --- |
| Interactive design iteration | Avi | [Prototype](../pr-pane-prototype.html), [design decisions](../README.md#accepted-ui-direction) | 2026-09-29 |
| Full-page design reference | Avi | [PR page](../references/full-pr-reference.png) | 2026-09-29 |
| Review findings reference | Avi | [High Risk rows](../references/review-findings.png) | 2026-09-29 |
| Code controls feedback | Avi | [Before](../references/code-toolbar-before.png) | 2026-09-29 |

## Implementation notes

### Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx:378`: existing shared pane workspace.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx:801`: first-class pull-request pane registration.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/PullRequestPane/PullRequestPane.tsx:23`: current pane body and shared PR content.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/PullRequestPane/components/PullRequestPaneHeaderExtras/PullRequestPaneHeaderExtras.tsx:21`: existing copy-URL and full-view actions.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/$prNumber/page.tsx:24`: full PR route and current Summary/Code navigation.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailHeader/PullRequestDetailHeader.tsx:100`: existing PR actions and identity.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSummaryContent/PullRequestSummaryContent.tsx:52`: shared summary and embedded checks.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSection/PullRequestChecksSection.tsx:14`: existing checks component.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/$prNumber/components/PullRequestCodeTab/PullRequestCodeTab.tsx:912`: real Pierre CodeView; line-selection composer at line 716.

### Approach

Extend the registered PR pane and extract reusable content at the nearest shared parent so pane and full route use the same PR data and actions. Use the workspace's existing move/maximize/open behaviors. Implement the following acceptance criteria from the final prototype:

- [ ] Terminal and PR remain independent sibling panes; no nested pane manager or inner split controls.
- [ ] Functional top bar contains Review/Summary/Code, PR status, checks status, Auto-fix CI, copy/open actions, and existing pane controls. Actions that already exist in the application retain their real behavior.
- [ ] Checks appear as a compact consolidated list/popover, with passed/pending/failed status and links to detail. No dedicated Checks tab.
- [ ] Auto-fix CI uses a restrained labeled toggle. Define its actual backend behavior, availability, and error handling before shipping; the prototype only shows local state.
- [ ] PR pane has no bottom agent prompt. Review comments remain available. Actions that ask an agent to fix something pass relevant context to the existing terminal/agent workflow and preserve the user's current draft.
- [ ] Review findings match the supplied High Risk section: muted heading plus copy, rounded neutral rows, dashed markers, numbered titles, additions/deletions, risk badges, and Other Changes disclosure.
- [ ] Finding titles have accessible full text when truncated, and clicking a finding opens the correct file/location. Narrow rows wrap metadata rather than hiding counts or badges.
- [ ] Review retains evidence and comments with the reference's spacing and typography.
- [ ] Code reuses Pierre diffs with realistic syntax, gutters, hunk/context controls, word changes, unified/split layouts, inline review threads/comments, viewed and collapse state.
- [ ] One compact Code toolbar combines file navigation, total changes, layout icons, and display options. Wrapping lives in display options; viewed progress is in file navigation and per-file headers.
- [ ] Resizing a pane preserves the selected file, draft, viewed state, and user display preferences. Unified mode is readable when the pane is too narrow for split mode.

### Related code

`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/DiffPane.tsx:9` already uses Pierre and shares diff/theme/annotation patterns. Reuse those and the full-route CodeView integration instead of promoting the prototype's sample diff renderer into product code.

### Gotchas

- Current code already embeds checks in Summary and uses a first-class PR pane. The feedback changes their presentation and access; a separate Checks page exists in the design reference, not in the inspected current route.
- No Auto-fix CI implementation was found in the scoped PR components. The toggle in this design is a proposed control, not evidence of an existing feature.
- Keep PR identity and threads scoped to the selected PR. Current pane threads are shown only when that PR matches the workspace's linked PR; preserve or deliberately extend that contract.
- Toolbar actions currently depend on project/session context. Define appropriate disabled/available behavior for projectless sessions.
- Use repository design primitives, component co-location, Lingui strings, and the existing persisted-state policy for production work. Run i18n and verify the real desktop renderer when implementing it.
- The sample risk titles and counts demonstrate row appearance. They are not tickets to change release actions or dependencies and do not establish a real security finding.
