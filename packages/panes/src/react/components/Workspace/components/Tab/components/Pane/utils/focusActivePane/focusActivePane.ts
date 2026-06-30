/**
 * Minimal slice of `HTMLElement` that the focus policy needs. Kept narrow so the
 * behavior can be unit-tested without a DOM.
 */
export interface PaneFocusTarget {
	focus: () => void;
	contains: (node: Node | null) => boolean;
}

export interface FocusActivePaneArgs {
	/** Whether the pane is the active pane in its tab. */
	isActive: boolean;
	/** The pane's outer DOM container, or null before it mounts. */
	container: PaneFocusTarget | null;
	/** The element that currently holds DOM focus (`document.activeElement`). */
	activeElement: Node | null;
}

/**
 * Moves DOM focus into the pane container when the pane becomes active and focus
 * currently lives outside it (for example another pane's terminal).
 *
 * Selecting a pane via keyboard shortcut only updates the store's `activePaneId`,
 * which re-renders the header as selected but never touches the DOM. Without this,
 * the previously focused element — such as the Claude Code terminal — keeps the
 * cursor, so keystrokes never reach the newly selected pane until the user clicks
 * it with the mouse. See issue #5317.
 *
 * Returns true when focus was moved.
 */
export function focusActivePane({
	isActive,
	container,
	activeElement,
}: FocusActivePaneArgs): boolean {
	if (!isActive || !container) return false;
	// Don't steal focus from an element already inside this pane: clicks and
	// pane-specific focus targets (xterm, code editor) must win over the generic
	// container, otherwise we'd yank the cursor off the real input.
	if (activeElement && container.contains(activeElement)) return false;
	container.focus();
	return true;
}
