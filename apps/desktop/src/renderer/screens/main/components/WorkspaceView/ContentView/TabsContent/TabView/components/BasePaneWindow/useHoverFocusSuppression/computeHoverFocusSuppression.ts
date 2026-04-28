export interface HoverFocusSuppressionDeps {
	isPointerDown: boolean;
	isPaneDragging: boolean;
	isResizing: boolean;
	hasWindowFocus: boolean;
	hasOpenOverlay: boolean;
}

export function computeHoverFocusSuppression(
	deps: HoverFocusSuppressionDeps,
): boolean {
	if (deps.isPointerDown) return true;
	if (deps.isPaneDragging) return true;
	if (deps.isResizing) return true;
	if (!deps.hasWindowFocus) return true;
	if (deps.hasOpenOverlay) return true;
	return false;
}
