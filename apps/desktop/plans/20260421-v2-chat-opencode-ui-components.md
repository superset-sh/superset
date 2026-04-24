# V2 Chat UI Components: What to Port from OpenCode

**Date:** 2026-04-21
**Companion to:**
- `20260421-v2-chat-opencode-rebuild.md` (architecture plan)
- `20260421-chat-implementations-compared.md` (three-way comparison)

Concrete list of the visible UI components from OpenCode's `packages/ui/src/components/` we'd port as part of the rebuild, with priority tiers and React mappings.

OpenCode's UI package is mostly **presentation** — hooks and data flow through props. That means most of these components port as pure React components with their current CSS, swapping only the framework primitives (Kobalte → Radix, SolidJS reactivity → React hooks, morphdom → React reconciliation, SolidJS motion → framer-motion).

---

## 0. Framework mapping cheat sheet

| OpenCode (SolidJS) | Superset (React) |
|---|---|
| `createSignal` / `createMemo` | `useState` / `useMemo` |
| `createEffect` + `on()` | `useEffect` |
| `createStore` (Solid store) | Zustand or `useState` with immer |
| `Show` / `For` / `Switch` / `Match` | conditional JSX / `.map` / ternary |
| Kobalte `Collapsible` / `Accordion` | Radix `@radix-ui/react-collapsible` / `@radix-ui/react-accordion` |
| Kobalte `Popover` / `DropdownMenu` | Radix equivalents (already in our `packages/ui`) |
| SolidJS `motion` springs | `framer-motion` (already used in our repo) |
| `morphdom` | React reconciliation + `useMemo` on stable prefixes (see §5) |
| CSS vars via `:root` | keep OpenCode's CSS vars pattern; map to our design tokens |

Data-attribute naming (`data-component`, `data-slot`, `data-state`, `data-type`) ports 1:1 — copy the CSS unchanged and the selectors still match.

---

## 1. Port list by tier

### Tier 1 — Port first (highest UX payoff, lowest effort)

These are the visible building blocks that make OpenCode's chat feel different. Nothing fancy, all small, all pay for themselves within days of shipping.

#### `BasicTool` — the tool card shell
**Source:** `temp/opencode/packages/ui/src/components/basic-tool.tsx` (283 LOC) + `basic-tool.css` (182 LOC)

Every tool-call part uses this. One collapsible card with:
- Left icon (16×16, tool-specific)
- Title (`TextShimmer` while pending)
- Subtitle (ellipsis-truncated, e.g. `command args...` or filename)
- Optional right-aligned action button
- Smooth height animation on expand/collapse (spring: `visualDuration: 0.35, bounce: 0`)
- **Deferred content rendering** — children don't mount until accordion opens (perf for sessions with 200+ tool calls)

Port as `components/Timeline/Parts/ToolPart/BasicTool.tsx`. Swap Kobalte Collapsible → Radix Collapsible, motion spring → framer-motion's `AnimatePresence` + `motion.div` with `height: "auto"`.

Props to preserve verbatim:
```ts
interface BasicToolProps {
  icon: IconName;
  trigger: { title: string; subtitle?: string; args?: string[]; action?: ReactNode } | ReactNode;
  status: "pending" | "running" | "completed" | "error";
  hideDetails?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  defer?: boolean;    // defer mounting children until opened
  locked?: boolean;   // can't be collapsed (e.g. active task card)
  animated?: boolean;
  children?: ReactNode;
}
```

The CSS (all the `[data-slot="basic-tool-..."]` selectors) ports unchanged.

#### `TextShimmer` — pulsing gradient on pending text
**Source:** `text-shimmer.tsx` (62 LOC) + CSS

Two stacked text layers, the top layer uses `background-clip: text` with an animated gradient. Used everywhere tool titles are streaming ("Shell", "Editing…", "Thinking…").

Port as `components/Timeline/Parts/TextShimmer.tsx`. Pure CSS animation, essentially no logic. **This is the single cheapest visual upgrade** — gives immediate "something is happening" feedback that polling-era Superset completely lacks.

#### `ToolErrorCard` — distinct error UX
**Source:** `tool-error-card.tsx` (144 LOC) + CSS

Error-tinted collapsible card:
- Red icon + tool name + first line of error as subtitle (collapsed state)
- Full error + copy-to-clipboard button (expanded, hover-revealed)
- Strips `"Error: "` prefix; splits error on `": "` to extract a clean one-liner
- 2s "Copied!" feedback on copy

Port as `components/Timeline/Parts/ToolPart/ToolErrorCard.tsx`. Swap Kobalte Collapsible → Radix. Everything else is straight JSX.

Today we render errors inline with normal tool output and users miss them. First-class error UI is a reliability signal.

#### Diff badge (`DiffChanges`)
**Source:** `diff-changes.tsx` (115 LOC) + CSS

Compact `+42 -7` pill, two variants:
- **Default:** just the numbers
- **Bars:** up to 5 colored blocks proportional to add/delete ratio (green/red/gray), with edge-case handling for tiny changes (always ≥1 block)

Port as `components/Timeline/Parts/ToolPart/DiffChanges.tsx`. Pure calculation + SVG/divs. No dependencies. Drops into every edit/write/apply-patch tool trigger.

#### Tool registry dispatch
**Source:** `message-part.tsx:159` (PART_MAPPING) and the tool dispatch at `:1301`

Pattern, not a component:
```ts
const PART_MAPPING = { text, reasoning, tool, file, image, agent };

const TOOL_REGISTRY = {
  shell: ShellTool,        // bash / terminal
  bash: ShellTool,
  edit: EditTool,
  str_replace: EditTool,
  write: WriteTool,
  read: ReadTool,
  glob: GlobTool,
  grep: GrepTool,
  list: ListTool,
  task: TaskTool,
  todo: TodoTool,
  question: QuestionTool,
  web_fetch: WebFetchTool,
  web_search: WebSearchTool,
  code_search: CodeSearchTool,
  apply_patch: ApplyPatchTool,
  // fallback:
  _default: GenericTool,
};

function ToolPartRenderer({ part, message, active }) {
  const Component = TOOL_REGISTRY[part.tool] ?? TOOL_REGISTRY._default;
  return <Component part={part} message={message} active={active} />;
}
```

Port as `components/Timeline/Parts/ToolPart/toolRegistry.ts`. Pluggable — adding a new tool type = one line. This is the biggest architectural shape to get right early; everything else in Tier 2 plugs in behind it.

---

### Tier 2 — Port alongside Tier 1 (per-tool renderers)

These are the individual tool UIs that plug into the registry. Each is small (50–150 LOC) and shares `BasicTool` underneath.

#### `ShellTool` (bash / terminal)
**Source:** `message-part.tsx:1820-1884`

```
BasicTool
├─ trigger: TextShimmer("Shell") + ShellSubmessage(description, animates in on completion)
└─ content:
   ├─ copy-to-clipboard button (hover-revealed, top-right)
   └─ <pre><code>  (scrollable, monospace, data-scrollable)
      stripAnsi(`$ ${command}\n\n${output}`)
```

States:
- **pending:** TextShimmer active, no description visible, no output yet
- **running:** output streams into the pre block
- **completed:** description slides in (width 0→auto, opacity 0→1, blur unsharp); copy button visible on hover

Dependencies: `strip-ansi` (npm). Already ubiquitous.

#### `EditTool` / `WriteTool`
**Source:** `message-part.tsx:1886-2015`

Edit:
```
BasicTool (defer=true)
├─ trigger: filename + directory (dimmed) + <DiffChanges additions deletions />
└─ content (rendered only when opened):
   ├─ <FileDiff before={metadata.filediff.before} after={metadata.filediff.after} mode="diff" />
   └─ <DiagnosticsDisplay errors={filteredDiagnostics} />  (up to 3, line+col)
```

Write is the same but `mode="text"` and shows only the new content (no before).

**Dependency:** we need a diff renderer. OpenCode injects a `fileComponent` via context — we should do the same to stay decoupled. Options in order of preference:
1. Reuse whatever we use in the `v2-review-tab` today.
2. `react-diff-view` or `@git-diff-view/react`.
3. Plain side-by-side-lines renderer behind the same interface — ship it, replace later.

**Port as `components/Timeline/Parts/ToolPart/EditTool.tsx` + a `FileDiff` slot** that gets injected from `ChatSurface` so the same chat renders different diff UIs in different contexts.

#### `ReadTool` / `GlobTool` / `GrepTool` / `ListTool`
**Source:** `message-part.tsx:1530-1639`

All share the same shape:
```
BasicTool
├─ trigger: title + subtitle (path, pattern, etc.)
└─ content: <Markdown source={output} />
```

Read additionally lists loaded files as `tool-loaded-file` items. Port as four thin wrappers around a `BasicMarkdownTool` shared parent.

**Context grouping:** OpenCode also bundles consecutive read/glob/grep/list calls into a single summary card (`message-part.tsx:696-761`). Worth copying — cuts visual noise on sessions that do exploration.

#### `ApplyPatchTool` (multi-file patch)
**Source:** `message-part.tsx:2017-2206`

The most sophisticated tool UI and the one that pays off most on complex sessions.

```
BasicTool (deferred)
└─ Accordion (multi-open, sticky headers):
   For each file in patch:
     AccordionItem:
       ├─ StickyAccordionHeader:
       │    <FileIcon path /> directory / filename <ChangeBadge />
       │    ChangeBadge: "created" | "deleted" | "moved" | "+N -M"
       └─ AccordionContent (lazy — visible signal gates mount):
            <FileDiff mode="diff" fileDiff={...} />
```

Sticky offset CSS: `position: sticky; top: var(--sticky-accordion-offset)`. File header stays in view while scrolling through a 500-line diff.

Lazy content: render nothing until the item is opened — a `useState(visible)` set on open event, `{visible && <FileDiff …/>}`. Essential for 10-file patches.

Single-file patches skip the accordion (fast path).

#### `TaskTool` (subagent delegation)
**Source:** `message-part.tsx:1739-1818`

Distinctive card style (rounded border, subtle bg, not BasicTool):
```
TaskCard
├─ Spinner (tinted to agent tone)
├─ Title: capitalized agent name, colored
├─ Subtitle: task description or session ID
└─ hover-revealed "open" icon (arrow-top-right)
```

Click → navigate to child session. Locked while running (no collapse). Superset has a `SubagentExecutionMessage` today — this is its replacement, cleaner and pluggable as a part.

#### `TodoTool`
**Source:** `message-part.tsx:2208-2257`

```
BasicTool (defaultOpen=true)
└─ For each todo:
   <Checkbox readOnly checked={todo.done} />
   <span data-done={todo.done}>{todo.content}</span>  // strike-through if done
```

Trivial to port, high user value. We don't render todos at all today.

#### `QuestionTool`
**Source:** `message-part.tsx:2259-2299`

Renders **only when answered** (while pending/running it's hidden and the `QuestionDock` takes over — important: this tool does NOT duplicate the dock).

```
BasicTool (defaultOpen if completed)
└─ Q/A list:
   For each q in questions:
     <div class="question">{q.question}</div>
     <div class="answer">{q.answers.join(", ") || "No answer"}</div>
```

Subtitle: `"1 question"` / `"Answered 3 questions"`.

#### `WebFetchTool` / `WebSearchTool` / `CodeSearchTool`
**Source:** `message-part.tsx:1642-1737`

Web fetch:
```
BasicTool (hideDetails=true — no collapse)
└─ trigger: query/URL as clickable link, external icon in action slot
```

Web/code search: same pattern. Output for Exa-style search is a URL list (`ExaOutput` at lines 770-794). Low priority but very cheap.

#### `GenericTool` (fallback)
**Source:** the default branch of the tool dispatch

```
BasicTool
├─ trigger: title = tool name, subtitle = JSON-stringified input
└─ content: <pre>{JSON.stringify(output, null, 2)}</pre>
```

Catches MCP tools and anything unregistered. Ugly on purpose — surfaces "we don't have a renderer for this" without crashing.

---

### Tier 3 — Polish / second wave

Ship these once Tier 1–2 is live and proven.

#### `Markdown` + `MarkdownStream`
**Source:** `markdown.tsx` (348 LOC) + `markdown-stream.ts` (49 LOC)

OpenCode's markdown renderer uses `marked` + DOMPurify + **morphdom** to patch the rendered HTML in place as tokens stream. Morphdom is why the stable prefix doesn't flicker when the last paragraph is still arriving.

**React port notes:**
- Morphdom is unnecessary in React — React's own reconciler does the equivalent if we `useMemo` the stable prefix's rendered output and re-render only the live segment.
- Use `react-markdown` (we already have it) or keep `marked` + DOMPurify + `dangerouslySetInnerHTML` on a ref.
- Port `markdown-stream.ts` verbatim — it's a pure function that splits input into stable + live segments based on an unclosed code fence. No framework coupling.
- Port `remend` (library, healing incomplete markdown syntax) — or pick the parallel inside `react-markdown`'s stream support.
- Keep the auto-injected copy buttons on code blocks and the inline-code URL auto-link.

Why this isn't Tier 1: we already render markdown, just worse. The upgrade is noticeable but won't be felt in demo the way `TextShimmer` and `BasicTool` will.

#### `PacedMarkdown`
**Source:** `message-part.tsx:235-246`

Wraps `Markdown` with client-side character pacing. `TEXT_RENDER_PACE_MS = 24`. `next(text, shown.length)` computes the next chunk boundary, snapped to whitespace. When `live()` flips false, syncs to full text immediately.

React port:
```ts
function PacedMarkdown({ text, live }: { text: string; live: boolean }) {
  const [shown, setShown] = useState(text);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (!live) {
      setShown(text);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setShown(prev => {
        const end = nextChunkBoundary(text, prev.length);
        return text.slice(0, end);
      });
      if (shown.length < text.length) {
        frameRef.current = window.setTimeout(tick, 24);
      }
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(frameRef.current);
    };
  }, [text, live]);

  return <Markdown source={shown} />;
}
```

#### `ToolStatusTitle`
**Source:** `tool-status-title.tsx` (138 LOC)

Animates state-transition text like "Compiling..." → "Compiled". Detects common prefix ≥2 chars, renders prefix once with shimmer, cross-fades the suffix on state change. Uses `contentWidth()` measurement to prevent layout shift.

Nice-to-have. Skip unless we're matching a spec.

#### `AnimatedNumber` + `ToolCountSummary` + `AnimatedCountLabel`
**Source:** `animated-number.tsx`, `tool-count-summary.tsx`, `tool-count-label.tsx`

Odometer-style digit strip animating when tool counts change. Used on the grouped context-tools card.

CSS-only animation, vertical translate on a digit strip. Pretty. Defer to polish pass.

#### `ShellSubmessage`
Slide-in/slide-out reveal of a subtitle on a tool card. Used by ShellTool when a description arrives. Part of `basic-tool.tsx` region; port along with BasicTool.

#### `StickyAccordionHeader`
**Source:** `sticky-accordion-header.tsx` (18 LOC)

Trivial — a Radix AccordionHeader with `data-component="sticky-accordion-header"` and `position: sticky; top: var(--sticky-accordion-offset)` in CSS. Port with `ApplyPatchTool`.

#### `ThinkingIndicator` / reasoning block
**Source:** `message-part.tsx` + `thinking-heading.stories.tsx`

Two cases:
- **Reasoning summary on (setting):** collapse reasoning, render the extracted heading. Heading extraction is `heading()` util in `session-turn.tsx`.
- **Reasoning summary off:** show full reasoning block in its own card style.

Plus the streaming "Thinking…" `TextShimmer` shown when `working && visibleAssistantText === 0`.

Port as `components/Timeline/Turn/ThinkingIndicator.tsx` + `components/Timeline/Parts/ReasoningPart.tsx`. Both small.

---

### Tier 4 — Probably skip or reimagine

- **`typewriter.tsx` / `text-reveal.tsx`** — char-by-char reveal effects. `PacedMarkdown` covers the same need for assistant text. Skip unless we want it for the thinking shimmer (which is covered by TextShimmer already).
- **`motion-spring.tsx`** — framer-motion has the same primitives built in.
- **`session-retry.tsx`** — specific to OpenCode's retry UX. Revisit when we actually hit retries.
- **`line-comment.tsx`** — review-panel UI. Our review panel is separate; if we port review, we port this with it, not with chat.
- **`file-search.tsx`** — part of their prompt-input. Our Tiptap mention extension handles this differently; skip.

---

## 2. Tool cards: semantic patterns to preserve

When porting, keep these semantic rules even if we tweak the styling:

1. **Status machine is universal.** Every tool card honors `pending → running → completed | error`. UI behavior maps:
   - `pending` → TextShimmer on title, no content yet
   - `running` → output streams (may also show TextShimmer depending on tool)
   - `completed` → copy button visible on hover, description/output finalized
   - `error` → swap entire card for `ToolErrorCard`

2. **Defer content render.** `BasicTool.defer` means children don't mount until the accordion opens. With `content-visibility: auto` on inactive turns layered on top, a 300-tool-call session stays light.

3. **Error-first rendering.** `ToolPartRenderer` checks error state **before** routing to the tool-specific component, so a bad edit tool falls back to `ToolErrorCard`, not to a half-rendered edit panel.

4. **Context grouping.** Consecutive context-only tools (read/glob/grep/list) collapse into one card with `ToolCountSummary`. Prevents exploration-heavy sessions from drowning the user in 40 individual cards.

5. **Copy buttons are hover-revealed.** Every tool card with copyable content has a copy button at top-right, visible only on hover/focus-within. 2s "Copied!" feedback on click. Pattern lives in `basic-tool.css` and `tool-error-card.css`.

6. **Subtitles come from input, not just metadata.** File paths, patterns, URLs, command strings. Lets the user identify a tool call at a glance even when collapsed.

7. **`data-scrollable` on nested scrollers.** Every internal scroller (shell output pre, tool output markdown, diff body, patch accordion) gets `data-scrollable` so wheel/touch inside doesn't mark the outer scroller's "user took over" flag. Plumb this through every nested scrollable we add.

8. **Sticky headers for long diffs.** Every accordion that might contain >300 lines of content gets a sticky header so the user knows what they're looking at.

---

## 3. File layout for the port

Slot into the tree from the main rebuild plan (§2.5):

```
ChatSurface/components/Timeline/Parts/
  parts.ts                          # part-type registry (text/reasoning/tool/file/image/agent)
  TextPart.tsx
  ReasoningPart.tsx                 # uses extracted-heading collapse + full expand
  FilePart.tsx
  ImagePart.tsx
  AgentPart.tsx
  PacedMarkdown.tsx
  MarkdownStream.tsx                # stable/live split
  Markdown.tsx                      # renderer wrapper
  TextShimmer.tsx
  ToolPart/
    index.ts
    ToolPart.tsx                    # dispatch via toolRegistry, error-first
    toolRegistry.ts
    BasicTool.tsx                   # shared card shell
    BasicTool.css
    ShellSubmessage.tsx
    ToolErrorCard.tsx
    ToolErrorCard.css
    ToolStatusTitle.tsx             # Tier 3
    DiffChanges.tsx
    DiffChanges.css
    ToolCountSummary.tsx            # Tier 3
    AnimatedNumber.tsx              # Tier 3
    DiagnosticsDisplay.tsx
    tools/
      ShellTool.tsx
      EditTool.tsx
      WriteTool.tsx
      ApplyPatchTool.tsx
      ReadTool.tsx
      GlobTool.tsx
      GrepTool.tsx
      ListTool.tsx
      TaskTool.tsx
      TodoTool.tsx
      QuestionTool.tsx
      WebFetchTool.tsx
      WebSearchTool.tsx
      CodeSearchTool.tsx
      GenericTool.tsx
    context/
      FileDiffContext.tsx           # injected slot for diff renderer
      FileIconContext.tsx           # optional — we have our own
```

Every `ToolPart/tools/<Foo>Tool.tsx` gets a sibling `.logic.ts` + `.logic.test.ts` per t3code's pattern (from the comparison doc). The logic file holds:
- `getTitle(part)`, `getSubtitle(part)`, `getArgs(part)`, `getIcon(part)` — pure string derivations from `part.state.input`
- `isExpandable(part)`, `defaultOpenFor(part)` — display rules
- `normalizeOutput(part)` — any cleanup (stripAnsi for shell, filename extraction for edit, etc.)

These become the test surface. The `.tsx` file does JSX only.

---

## 4. What we already have that slots in

Don't rebuild what works:

- **`@superset/ui` Radix primitives** — Collapsible, Accordion, DropdownMenu, Popover, Tooltip, HoverCard. All available, swap directly for Kobalte equivalents.
- **`lucide-react` icons** — OpenCode uses its own icon system; we use lucide. Map: `chevron-down`, `circle-alert` → `AlertCircle`, `circle-ban-sign` → `Ban`, `arrow-top-right` → `ArrowUpRight`, `dot-grid` → `MoreVertical`, `wrench` / `hammer` → `Wrench` / `Hammer`. One-line mapping file.
- **`framer-motion`** — already a dep. Replaces OpenCode's SolidJS motion usage directly.
- **Tailwind v4** — our styling stack. Port OpenCode's CSS files as `.css` next to each component (CSS Modules style) or convert to Tailwind utilities. **Recommendation:** copy their `.css` files verbatim first (they use the same `data-*` attribute selector pattern), refactor into utilities only after parity.
- **`@ai-sdk/react`** — we're already on the Vercel AI SDK. OpenCode's streaming tool-call shape maps to AI SDK v3's `toolCall` / `toolResult` events in the assistant stream. The Message→Part→Turn model in the main plan handles the translation at the edge.

---

## 5. Markdown streaming — React port

The subtlest port is the stable/live markdown split. OpenCode uses morphdom; React doesn't need it because its own reconciler does the equivalent **if** we structure the component so the stable prefix memoizes.

Structure:
```tsx
function MarkdownStream({ text, live }: { text: string; live: boolean }) {
  const blocks = useMemo(() => splitMarkdownStream(text, live), [text, live]);
  //  splitMarkdownStream from markdown-stream.ts (pure port)
  //  returns: Array<{ raw, src, mode: "full" | "live" }>

  return (
    <>
      {blocks.map((block, i) => (
        <MarkdownBlock
          key={block.mode === "full" ? i : "live"}  // stable prefix keyed by index, live tail always remounts
          src={block.src}
          live={block.mode === "live"}
        />
      ))}
    </>
  );
}

const MarkdownBlock = memo(({ src, live }: { src: string; live: boolean }) => {
  // react-markdown render (or marked + DOMPurify) — memoized by `src`
  return <Markdown source={src} />;
}, (prev, next) => !next.live && prev.src === next.src);
```

Key insight: the stable blocks are `memo`-equality on `src`, so they literally do not re-render while the live tail streams. No morphdom needed.

**Pitfall:** if we pass text deltas instead of the full text to `MarkdownStream`, this breaks. Always give it the full cumulative `text`; the memo handles the rest.

---

## 6. Streaming transport clarification

(This one supersedes a detail in `20260421-v2-chat-opencode-rebuild.md` §2.4.)

Per `apps/desktop/AGENTS.md`, Electron IPC in this repo uses **tRPC** with `trpc-electron`, and **subscriptions must be `observable` (not async generators)**. So the Phase 5 "SSE or IPC" decision is already made for the desktop path:

```ts
// packages/chat/src/server/desktop/router.ts
import { observable } from "@trpc/server/observable";

export const chatRouter = router({
  streamSession: publicProcedure
    .input(z.object({ sessionID: z.string() }))
    .subscription(({ input }) =>
      observable<ChatStreamEvent>((emit) => {
        const unsub = chatBus.on(input.sessionID, (ev) => emit.next(ev));
        return () => unsub();
      })
    ),
});
```

On the client:
```ts
const sub = trpc.chat.streamSession.useSubscription(
  { sessionID },
  { onData: (event) => chatStore.applyStreamEvent(event) },
);
```

Web/mobile can use SSE behind the same `ChatStream` adapter interface later if we need it.

The recovery coordinator ported from t3code (`20260421-chat-implementations-compared.md` §10 #2) sits in front of `applyStreamEvent` — sequencing, gap detection, replay — regardless of transport.

---

## 7. Port plan (folded into the rebuild timeline)

| Phase | UI components |
|---|---|
| **Phase 2** (new Timeline) | `BasicTool`, `TextShimmer`, `ToolPart` dispatch, `toolRegistry`, `GenericTool`, `DiffChanges`, `ToolErrorCard` — the skeleton. All tools default to `GenericTool` at first. |
| **Phase 2.5** (per-tool renderers) | `ShellTool`, `EditTool`, `WriteTool`, `ReadTool`, `GlobTool`, `GrepTool`, `ListTool`, `TodoTool`, `ApplyPatchTool`. Depends on a `FileDiff` slot being wired. |
| **Phase 2.6** (polish) | `PacedMarkdown`, `MarkdownStream`, `ThinkingIndicator`, `ReasoningPart`, `StickyAccordionHeader`, context-group card with `ToolCountSummary`. |
| **Phase 3** (docks) | Dock components — unaffected by this list, they don't use `BasicTool`. |
| **Phase 4** (composer) | Composer components — unaffected. |
| **Post-MVP** | `AnimatedNumber`, `ToolStatusTitle`, `WebFetchTool`/`WebSearchTool`/`CodeSearchTool`, `TaskTool`. |

Rough effort: **~2 weeks** for Phase 2 + 2.5 + 2.6 by one engineer, assuming the diff renderer slot is already solved by `v2-review-tab` work.

---

## 8. File references

All paths relative to `temp/opencode/packages/ui/src/components/` unless noted.

Core shell:
- `basic-tool.tsx` (283) + `basic-tool.css` (182)
- `tool-error-card.tsx` (144) + `tool-error-card.css`
- `tool-status-title.tsx` (138)
- `tool-count-summary.tsx` (52) + `tool-count-label.tsx`
- `diff-changes.tsx` (115)
- `sticky-accordion-header.tsx` (18)
- `accordion.tsx`, `collapsible.tsx` (Kobalte wrappers)

Dispatch and tool renderers (all inside `message-part.tsx`):
- PART_MAPPING: `:159`
- ToolPartDisplay / dispatch: `:1301`
- ShellTool: `:1820-1884`
- EditTool: `:1886-1956`
- WriteTool: `:1958-2015`
- ApplyPatchTool: `:2017-2206`
- TaskTool: `:1739-1818`
- TodoTool: `:2208-2257`
- QuestionTool: `:2259-2299`
- Read/Glob/Grep/List: `:1530-1639`
- Web fetch/search: `:1642-1737`
- PacedMarkdown: `:235-246`
- Context-tool grouping: `:696-761`

Streaming / animation:
- `text-shimmer.tsx` (62)
- `animated-number.tsx` (110)
- `markdown.tsx` (348) + `markdown-stream.ts` (49)
- `text-reveal.tsx`, `typewriter.tsx` — skip (§1 Tier 4)

Turn composition:
- `session-turn.tsx` (533) — referenced by main rebuild plan §2.5, not a leaf component to port.
