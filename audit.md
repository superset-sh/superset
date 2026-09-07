# Shared input-group popup audit

The new-workspace search dismissal was reproduced in the real Electron renderer before the fix: clicking Linear, GitHub issue, or pull-request search moved focus into the composer and closed the popup. After the fix, search retains focus and the popup remains open. The guard only excludes React portal events originating outside the addon's DOM subtree.

## Consumers audited

| Consumer | Finding |
| --- | --- |
| NewWorkspaceScreen | Confirmed affected. The shared guard fixes Linear/GitHub/PR search interaction and protects its agent/model/effort portals. Verified in the running app. |
| DashboardNewWorkspaceForm/PromptGroup | Shares the contenteditable composer, InputGroupAddon footer and issue pickers with NewWorkspaceScreen. Receives the same fix; this modal variant was audited in source rather than separately exercised live. |
| Legacy NewWorkspaceModal/PromptGroup | Uses the same footer, but a textarea. Its GitHub/PR popovers also explicitly prevent focus-out dismissal. Receives the portal guard, although the exact new-screen dismissal was not reproduced in this variant. |
| TerminalRichInput | Footer contains a terminal icon and submit button, with no portaled picker inside the footer. The ordinary contenteditable focus path remains intact. |
| Web PreviewPromptComposer / AgentPromptInput | Model, attachment and submit controls are currently disabled; no active popup journey exposes this bug. |
| Web InputsSection | Direct InputGroupAddon consumers have an icon, suffix text, or send button. The guard allows their normal DOM events through. |
| PromptInputHeader | Exposes the same addon wrapper; no application consumers found. Protected for future portaled children. |
| Mobile PromptInputFooter | Separate React Native View implementation; does not consume the changed DOM primitive. |

Search covered all TS/TSX references to InputGroupAddon, PromptInputFooter and PromptInputHeader in apps/ and packages/, plus similar ancestor click/focus handlers. Other click guards found in the sidebars do not share this composer refocus path.

## Additional pre-existing findings

- **Legacy branch picker retains filters after selection.** CompareBaseBranchPickerInline clears branchSearch/filterMode in Popover.onOpenChange, but selection/open-workspace paths call setOpen(false) directly. This is the same cleanup pattern fixed in the v2 picker. Source-audit finding; legacy UI was not live-reproduced or changed in this PR.
- **Addon padding does not focus textarea controls.** InputGroupAddon looks for input or contenteditable, but not textarea. This affects the legacy textarea composer and the web textarea example's padding focus behavior. It predates this change; adding textarea support would change existing behavior and needs separate verification.

These are follow-up findings, not claimed live regressions or additional fixes in this PR.

## Verification

- New regression tests mount actual InputGroupAddon + Radix Popover together and exercise search clicks/typing, a checkbox label, normal addon clicks and trigger action. The search interaction test fails with the portal guard removed; both tests pass with the fix.
- Both Radix integration test files pass together (3 tests, 16 assertions).
- Full new-workspace-page UI audit covered issue search/selection/scrolling/toggles, projects, branches, agent/model/effort menus and nested model choices, device and nested host menus, cloud environments, create/clone dialogs, native chooser opening/cancellation, tooltips and image previews. Nine repeated search interactions after page navigation retained focus, with zero captured console errors.
- The branch picker cleanup was reproduced before the fix and verified after pointer and keyboard selection: reopening clears the search.
- Native file selection and populated prompt history were not verified end-to-end. Image preview used a repo icon supplied through CDP file-input setup. OMP launch mode was unavailable in the installed agent list. Remote host selection, image download and branch Open workspace actions were not exercised.
