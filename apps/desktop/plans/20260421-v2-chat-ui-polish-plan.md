# V2 Chat UI Polish Plan

**Date:** 2026-04-21
**Companion:** `20260421-v2-chat-refactor-phased-plan.md`, `20260421-v2-chat-opencode-ui-components.md`

Honest read: the new chat works end-to-end but every component is MVP-grade. The gap between what's there today and OpenCode / the legacy Superset v2 chat is real. This doc enumerates every visual gap I can see, rates severity, and lays out a concrete polish plan.

---

## 1. Today's component inventory — candid grades

| Component | What's there | Grade | Worst issue |
|---|---|---|---|
| `BasicTool` | Radix Collapsible + height CSS anim + TextShimmer pending | B | Hover/focus states basic; no keybind chip; spacing is utilitarian |
| `ShellTool` | Mono pre, copy button | C+ | Copy is hover-revealed but styling is crude; no syntax highlighting |
| `EditTool` | Two-column before/after fallback | C | Not a real unified diff view; no syntax; no line numbers |
| `WriteTool` | Mono pre with filename | C | Same — missing syntax |
| `ReadTool` | Scrollable pre | C- | Ignores markdown when content is markdown |
| `Grep/Glob/ListTool` | Shared monotool wrapper | C | Crude output formatting |
| `ApplyPatchTool` | Radix accordion, sticky headers, two-column | B- | Heavy but functional; accordion trigger has style issues |
| `TodoTool` | Unicode checkboxes in a BasicTool | C+ | Unicode chars look inconsistent cross-platform; no animation on check |
| `QuestionTool` (in-timeline) | BasicTool Q/A list | C | Bare-minimum; no alignment of questions/answers |
| `WebFetch/Search/CodeSearch` | Link rows | C | No favicon, no URL preview |
| `TaskTool` | Card with description + summary | C+ | No agent color accent; no click-to-navigate; no running progress |
| `GenericTool` | BasicTool with JSON dump | C | Raw JSON is the worst fallback — no syntax highlighting |
| `ToolErrorCard` | Red-tinted collapsible + copy | B | Reasonable — closest to OpenCode parity |
| `DiffChanges` | `+42 -7` badge | B | Missing bars variant |
| `TextShimmer` | CSS gradient sweep | A- | Faithful port |
| `Markdown` | react-markdown + remark-gfm + sanitize | B | No copy-on-codeblock, no URL-inline-link auto-detection |
| `PacedMarkdown` | 24ms pacing + stable prefix | A- | Works; some edge cases around code-fence boundaries |
| `ReasoningPart` | Collapsible with heading extraction | B | Heading extraction good; raw text body needs markdown, not pre |
| `UserTurnHeader` | Right-aligned bubble, parts inline | C+ | No timestamp, no model/agent indicator, no edit affordance |
| `AssistantParts` | Renders parts sequentially | C | No spacing/dividers; no `completed in Xs` footer |
| `ThinkingIndicator` | Three animated dots + "Thinking…" | B | Works; no progress bar like OpenCode's pacing bar |
| `PermissionDock` | Amber card + 3 buttons | C+ | Buttons generic; tool args are JSON dump |
| `QuestionDock` | Blue card + option buttons + text input | **C–** | **Biggest gap — user called this out** |
| `PlanDock` | Blue card + markdown + approve/reject | C | Markdown inside a scroll area works; form below is crude |
| `TodoDock` | Unicode checklist | C+ | Same as TodoTool |
| `FollowupDock` | Muted card + item rows | C | Inline-edit interaction has no save affordance |
| `Composer` (Tiptap shell) | Plain editor + attachment row + paste | **C–** | **No mentions, no slash, no formatting UI, no resize indicator** |
| `AttachmentRow` | Image thumbs + remove | C+ | Works; remove X appears only on hover |
| `JumpToBottomButton` | Pill with arrow, fade in/out | B | Faithful |
| `ChatSearch` | Overlay, match count, prev/next | B- | No highlight on the matched text in-place |
| `Timeline` scrolling | Auto-scroll + jump button | C (today), B after this commit's fix | The ResizeObserver was unreliable — fixed with content-signal trigger |

**Rough distribution:** ~40% at C/C–, ~45% at B/B–, ~15% at A–/A. The C-/C tier is where the user's "bad" feeling is coming from, and QuestionDock + Composer + the tool output rendering are the worst offenders.

---

## 2. Sequenced polish plan

### Tier A — two-day wins (visible, low risk, user-called-out)

**A1. QuestionDock redesign.** Biggest specific complaint. Target: OpenCode's question-dock layout.
- Option buttons as full-width rows with left-aligned label + description + keybind chip (1-9).
- Selected option gets a primary-color border + check icon.
- Free-text input has a send icon in-row instead of a separate button.
- When submitting, show a per-option spinner.
- Multi-select support: checkbox toggles, "Send N selected" button.
- Animated entrance/exit with framer-motion (we already have it).
- Spec: port layout from `temp/opencode/packages/ui/src/components/*` question component if it exists, else match the mockup in §4 below.

**A2. Composer polish.** Second biggest gap.
- Add a toolbar row above the textarea: model picker (lift from legacy), MCP controls (lift from legacy), attachment icon (file picker → same PendingAttachment flow), thinking-level selector.
- Footer: keybind chip for Enter, Shift+Enter hint; character count (muted) for long drafts.
- Tiptap editor: add Bold / Italic / Code keybinds (cmd+B, cmd+I, cmd+E) via extensions. No formatting toolbar — just keyboard support.
- Placeholder animation on empty: subtle fade-in suggestion rotator ("Ask me anything…", "Paste a screenshot…", "Type / for commands").
- When `blockedByDock`, show a tiny status line above the editor ("Respond to the prompt above first") rather than just dimming.

**A3. Tool output polish — shell + read.**
- Shell: syntax highlighting on the `$ command` line (bash prompt style). Strip ANSI but preserve bold/underline via inline spans. Exit-code chip on completion.
- Read: if output looks like markdown, render as markdown (via `Markdown`). If it looks like code (first line is `#!` or extension in subtitle), use a simple Prism-lite highlighter for the common extensions (ts/tsx/js/py/go/rs/json/yaml).

**A4. Assistant message footer.**
- Under each completed assistant turn: muted line with duration ("2.4s"), model name, token count (if available in the data). Copy-message button, regenerate button (stubs until Phase 7.2 revert).

### Tier B — one-week wins (bigger components, real polish)

**B1. Edit / Write / ApplyPatch diff viewer.**
- Port a real unified-diff renderer. Use `@git-diff-view/react` or build a small one.
- Line numbers, add/remove gutters, syntax highlighting, collapse-unchanged-runs.
- The `FileDiffContext` slot we already provisioned in the plan — this is its payoff.

**B2. Tiptap custom nodes.**
- `mention`: `@` trigger → Tiptap suggestion extension → workspace file list. Resolves to a FilePart at send time.
- `slash`: `/` trigger → suggestion → slash-command preview (the v2 SlashCommandPreview already exists, port it).
- `file`: drag-drop file chips.
- `agent`: `@agent-name` for subagent routing (when we wire subagents fully).

**B3. Context-group card polish.**
- Instead of a generic count summary, show mini-preview rows inside the collapsed card:
  ```
  Context  reads: auth.ts, login.tsx  ·  greps: "authenticate"
  ```
- Animated count transitions (AnimatedNumber from OpenCode).

**B4. ReasoningPart body.**
- Render reasoning text as markdown (currently pre-wrap text). Already using PacedMarkdown in there — fix: the outer collapse container needs a min-height so the collapse animation is smooth.

**B5. Turn spacing + dividers.**
- User bubble + assistant block currently press against each other. Add subtle divider between turns (horizontal rule with muted color). Match OpenCode's spacing rhythm.

### Tier C — two-week wins (systemic polish)

**C1. Design token pass.**
- Today we use Tailwind utilities straight. Move to design tokens matching the rest of Superset (look for existing `--surface-*`, `--text-*` vars). Rewrite each component's class strings to use token-aliased utilities.

**C2. Motion pass.**
- Every dock entrance/exit via framer-motion with consistent timing.
- Collapsible height animations standardized (BasicTool already has the pattern).
- Subagent / tool transitions pending → running → completed with CSS crossfade on state.

**C3. Accessibility pass.**
- Keyboard navigation through tool cards (tab + enter to expand).
- Focus rings on every interactive element.
- `aria-live` region for the streaming assistant text so screen readers get updates.
- Dock elements `role="region"` with labels.

---

## 3. Relationship to existing plan docs

This polish plan DOES NOT replace the `20260421-v2-chat-opencode-ui-components.md` component port roadmap — it layers on top. The port roadmap identifies which OpenCode components to bring in; this doc says which of them to prioritize and what polish to add on top.

- Tier A items A1–A3 correspond to Phase 3 tail + Phase 5.1 leftovers in the phased plan.
- Tier B B1 is "FileDiffContext" from the original UI components doc.
- Tier B B2 is Phase 5.1 tail (Tiptap custom nodes).
- Tier C is not in the phased plan — it's "post-MVP polish."

---

## 4. QuestionDock redesign sketch

ASCII mockup for reference. Implementation hits Tier A first.

```
┌─ Agent question ─────────────────────────────────────────┐
│ "Should I refactor these imports to use named exports?"  │
├──────────────────────────────────────────────────────────┤
│  [1]  Yes — refactor                                     │
│       Updates 14 files, no behavior change               │
│                                                          │
│  [2]  No — leave as-is                                   │
│       Skips the task and moves on                        │
│                                                          │
│  [3]  Let me decide per-file                             │
│       Opens the review panel                             │
│                                                          │
│  Or type a response  [                    ] [ Send ↩ ]   │
└──────────────────────────────────────────────────────────┘
```

- Keybind chip (`[1]`, `[2]`, …) on the left, muted.
- Option label bold, description muted on the next line.
- Hover: background tint + left-border color.
- Selected: primary-color border + check icon.
- When submitting: spinner on the chosen option; others dim.

---

## 5. What's shipping in the commit alongside this plan

**Right now:**
- Scroll-stick fix via the `contentSignal` prop on `useAutoScroll` (Timeline computes character count + message count from the active turn; changes trigger a double-rAF stickToBottom). More reliable than the ResizeObserver path, which was missing streaming delta frames.

**Next commits — Tier A priorities, in order:**
1. QuestionDock redesign
2. Composer toolbar + attachment icon + slash command preview (Tiptap suggestion)
3. Tool output polish (shell syntax, read markdown)
4. Assistant message footer

---

## 6. How to track

I'm going to start checking off items here explicitly as they ship (same pattern as the phased plan). Each component that moves from C to B / B to A will be noted with the commit hash.

Tier A: `- [ ] A1 QuestionDock redesign`
Tier A: `- [ ] A2 Composer polish`
Tier A: `- [ ] A3 Tool output polish (shell + read)`
Tier A: `- [ ] A4 Assistant message footer`
Tier B: `- [ ] B1 Unified-diff viewer slot`
Tier B: `- [ ] B2 Tiptap custom nodes (mention + slash + file + agent)`
Tier B: `- [ ] B3 Context-group card polish`
Tier B: `- [ ] B4 ReasoningPart body as markdown`
Tier B: `- [ ] B5 Turn spacing + dividers`
Tier C: `- [ ] C1 Design token pass`
Tier C: `- [ ] C2 Motion pass`
Tier C: `- [ ] C3 Accessibility pass`
