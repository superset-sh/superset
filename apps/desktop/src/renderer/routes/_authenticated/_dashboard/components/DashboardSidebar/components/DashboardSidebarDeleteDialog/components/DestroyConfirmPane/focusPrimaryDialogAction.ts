export interface OpenAutoFocusEventLike {
	preventDefault: () => void;
}

interface FocusableLike {
	focus: () => void;
	disabled?: boolean;
}

/**
 * Radix's AlertDialog does not reliably move keyboard focus onto an actionable
 * button when this pane opens: the footer uses plain Buttons (not
 * AlertDialogAction/AlertDialogCancel), so the default open autofocus strands
 * focus on the content wrapper. When the dialog is triggered by the
 * CLOSE_WORKSPACE hotkey (⌘⇧⌫) the effect is that "focus is lost" and Enter
 * does nothing until the user clicks — see issue #5764.
 *
 * This mirrors the v1 DeleteWorkspaceDialog behaviour: override the default
 * autofocus and send focus to the first enabled candidate (primary destructive
 * action first, Cancel as a fallback) so Enter confirms immediately. If no
 * candidate is focusable we defer to Radix rather than stranding focus.
 */
export function focusPrimaryDialogAction(
	event: OpenAutoFocusEventLike,
	candidates: Array<FocusableLike | null>,
): void {
	const target = candidates.find(
		(candidate): candidate is FocusableLike =>
			candidate != null && candidate.disabled !== true,
	);
	if (!target) return;
	event.preventDefault();
	target.focus();
}
