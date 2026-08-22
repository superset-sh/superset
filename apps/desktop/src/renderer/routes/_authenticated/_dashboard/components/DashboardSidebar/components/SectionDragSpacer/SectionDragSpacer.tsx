import { useDashboardSidebarDnd } from "../../hooks/useSidebarDnd";

/**
 * Keeps the sidebar scroller's scrollHeight constant while a section drag
 * hides the group's member rows. Without it, the pickup shrinks the content;
 * when scrolled near the bottom the browser clamps scrollTop, and dnd-kit
 * folds that scroll delta into the DragOverlay transform — the ghost then
 * tracks the collapsed height away from the cursor for the whole drag.
 */
export function SectionDragSpacer() {
	const { sectionDragSpacerPx } = useDashboardSidebarDnd();
	if (sectionDragSpacerPx === 0) return null;
	return <div aria-hidden style={{ height: sectionDragSpacerPx }} />;
}
