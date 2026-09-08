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

## Additional findings fixed

- **Legacy branch picker retained filters after selection.** CompareBaseBranchPickerInline now routes selection, Open, Create, and dismissal through the same close handler, clearing both branchSearch and filterMode. The component was extracted unchanged apart from close handling so the actual picker can be mounted in regression tests. Mouse row selection, keyboard selection, Open, and Create all failed the reset assertion before the fix; all pass afterward, along with Escape.
- **Addon padding did not focus textarea controls.** InputGroupAddon now includes textarea in its focus target lookup. The textarea padding regression failed before the change and passes afterward. Tests cover input, textarea, and contenteditable focus, popup search clicks/typing, checkbox labels, and trigger actions, using the actual shared addon and Radix popup.

These additional findings were reproduced and verified with component integration tests, not the legacy modal's full live journey.

## Verification

- New regression tests mount actual InputGroupAddon + Radix Popover together and exercise search clicks/typing, a checkbox label, normal addon clicks and trigger action. The search interaction test fails with the portal guard removed; the interaction tests pass with the fix for input, textarea, and contenteditable composers.
- Both Radix integration test files and the legacy picker tests pass together (12 tests, 60 assertions).
- Full new-workspace-page UI audit covered issue search/selection/scrolling/toggles, projects, branches, agent/model/effort menus and nested model choices, device and nested host menus, cloud environments, create/clone dialogs, native chooser opening/cancellation, tooltips and image previews. Nine repeated search interactions after page navigation retained focus, with zero captured console errors. Six further Linear/GitHub/PR search interactions passed after the textarea and legacy picker changes.
- The branch picker cleanup was reproduced before the fix and verified after pointer and keyboard selection: reopening clears the search.
- Native file selection and populated prompt history were not verified end-to-end. Image preview used a repo icon supplied through CDP file-input setup. OMP launch mode was unavailable in the installed agent list. Remote host selection, image download and branch Open workspace actions were not exercised.
