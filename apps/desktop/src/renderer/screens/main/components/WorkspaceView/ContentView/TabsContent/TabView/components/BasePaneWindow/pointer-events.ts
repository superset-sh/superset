export interface PanePointerEventsOptions {
  draggingPaneId: string | null;
  paneId: string;
  isResizing: boolean;
}

/**
 * Disable pointer events only for the pane being dragged.
 *
 * Keeping all panes inert during any drag can leave unrelated terminals feeling
 * unscrollable when drag state lingers or when a different pane is being moved.
 */
export function shouldDisablePanePointerEvents({
  draggingPaneId,
  paneId,
  isResizing,
}: PanePointerEventsOptions): boolean {
  if (isResizing) return true;
  return draggingPaneId === paneId;
}
