# Overflow Fade

Use these components when overflowing content should fade only while there is hidden content beyond an edge.

## Public Imports

```tsx
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
```

For rare custom cases that use `useOverflowFade` directly, also import the CSS once:

```tsx
import "@superset/ui/overflow-fade.css";
```

## Choosing A Component

- Use `OverflowFadeText` for a constrained, single-line label. It applies the right fade only when the text actually overflows.
- Use `OverflowFadeContainer` for scroll containers. It fades only the edges that still have hidden scrollable content.
- Do not use the container component as a general clipping wrapper. CSS masks affect the whole painted element, including icons, controls, drag indicators, and scrollbars.

## Container Guidance

`OverflowFadeContainer` accepts `fadeEdges`, `observeChildren`, and `onOverflowChange`.

- `fadeEdges` defaults to `["right"]`.
- `observeChildren` is useful for small dynamic scrollers such as tabs or compact badge rows.
- Avoid `observeChildren` on large lists or virtualized content unless profiling shows it is safe.
- Use `onOverflowChange` only when the surrounding layout needs measured overflow state, such as moving an action outside the scroller once tabs overflow.

## Layout Notes

Overflow measurement happens in layout timing to avoid visible one-frame placement corrections. The hook is client-only and falls back safely outside the browser, but these components are intended for client-rendered UI.
