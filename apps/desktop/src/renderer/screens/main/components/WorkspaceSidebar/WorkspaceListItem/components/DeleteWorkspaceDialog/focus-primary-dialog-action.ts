export interface OpenAutoFocusEventLike {
	preventDefault: () => void;
}

interface FocusableLike {
	focus: () => void;
}

/**
 * Overrides Radix default open autofocus and sends focus to a known
 * actionable button so Enter works immediately after dialog open.
 */
export function focusPrimaryDialogAction(
	event: OpenAutoFocusEventLike,
	target: FocusableLike | null,
) {
	event.preventDefault();
	target?.focus();
}
