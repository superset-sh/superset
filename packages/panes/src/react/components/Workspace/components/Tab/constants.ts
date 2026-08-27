export const PANE_MIN_SIZE_CLASS_NAME = "min-h-[160px] min-w-[260px]";

// react-resizable-panels owns the pointer lifecycle for resize handles. A
// collapsed handle can move underneath the pointer before pointerup, so the
// double-click gesture is recognized from pointer-down capture on the handle.
export const RESIZE_HANDLE_DOUBLE_CLICK_DELAY_MS = 500;

// Native double-click recognition tolerates a small amount of pointer jitter.
// Movement beyond this threshold means the gesture was a resize, not a click.
export const RESIZE_HANDLE_CLICK_MAX_MOVEMENT_PX = 4;

// At a T-junction, a nested perpendicular handle can overlap its ancestor's
// hit area. Shallower handles stay above deeper ones so the border under the
// pointer does not change identity after that border is dragged. The pane
// tree root isolates, so these values only order elements within the tree —
// they never lift a handle above portalled overlays like dialogs.
export const RESIZE_HANDLE_BASE_Z_INDEX = 100;
