# [desktop] Window sometimes cannot be moved until resized

## Context

Sometimes, dragging to move the whole Superset window does not work. Resizing the window restores the ability to move it. Users should be able to move the window normally without using resize as a workaround.

## References

| Source | Who | Link | Date |
| --- | --- | --- | --- |
| Product feedback | Avi | [Notion page](https://app.notion.com/p/3eab9d5bf61680b9a6ded9e98069b80a) | 2026-09-29 |

## Implementation notes

### Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/TopBar.tsx:60`: explicit drag-region leaf in the top bar.
- `apps/desktop/src/renderer/globals.css:285`: drag/no-drag behavior and known nesting constraints.
- `apps/desktop/src/main/windows/main.ts:412`: native window configuration; resize behavior is relevant to the reported workaround.

### Approach

Capture a reproduction with the exact draggable area, route/pane state, window size, zoom, display setup, and app version. Observe drag behavior before and after resize, then isolate whether hit regions, an overlay, or native window state became stale. Fix the cause and verify normal dragging alongside top-bar controls.

### Gotchas

- Exact reproduction steps and root cause remain unconfirmed.
- Existing drag leaves avoid nested drag/no-drag regions under zoomed or masked wrappers; preserve that constraint when changing pane or top-bar chrome.
- An existing tiny-resize repaint helper is context, not proof of the reported bug's cause.
- Verify drag without resizing, after resizing, after changing panes/routes, and after moving between displays. This PR only captures the report.
