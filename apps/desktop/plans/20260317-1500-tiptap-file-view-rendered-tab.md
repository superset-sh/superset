# Use TipTap in file view rendered tab

## Goal

Use TipTap for markdown in the file viewer's `Rendered` tab without regressing save behavior, markdown feature coverage, or renderer safety.


## Current state

- The file viewer rendered tab uses `react-markdown` through `renderer/components/MarkdownRenderer`.
- Desktop already has a working TipTap markdown editor in the task detail view.
- File save and conflict handling are still built around the raw code editor path.


## Plan

### 1. Extract shared TipTap markdown renderer

- Pull the reusable TipTap setup out of the task editor into a shared desktop markdown component.
- Keep task-only features like slash commands and placeholder behavior optional.

### 2. Replace file-view rendered markdown only

- Swap the file viewer rendered markdown branch to the new TipTap component.
- Do not replace the shared `MarkdownRenderer` globally yet.

### 3. Ship read-only first

- Start with non-editable TipTap in the rendered tab.
- Reuse the existing rendered-tab search and selection behavior.

### 4. Refactor save flow for rendered editing

- Change file save logic so it can save explicit markdown content, not only raw editor state.
- Make unsaved changes, save-before-switch, and conflict handling work from either raw or rendered mode.

### 5. Enable editable rendered mode

- Wire TipTap updates into the existing draft and dirty-state flow.
- Preserve switching between rendered and raw without losing unsaved changes.


## Gaps to close before full replacement

- Tables: current `react-markdown` path supports them; current TipTap setup does not.
- Image safety: current renderer blocks unsafe image sources; TipTap must keep that policy.
- Mermaid/code block parity: current renderer has custom handling that TipTap does not yet match.
- Markdown round-trip via `tiptap-markdown` needs coverage before trusting it for arbitrary repo files.


## Recommendation

Do this in two passes:

1. Read-only TipTap in the file viewer rendered tab.
2. Editable TipTap after the save pipeline is generalized.
