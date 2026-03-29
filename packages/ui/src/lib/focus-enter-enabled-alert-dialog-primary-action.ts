export const alertDialogPrimaryActionSelector =
	"[data-slot='alert-dialog-action']:not([disabled])";

interface FocusableLike {
	focus: () => void;
}

interface EnterEnabledAlertDialogCurrentTargetLike {
	querySelector: (selector: string) => FocusableLike | null;
}

type EnterEnabledAlertDialogCurrentTarget =
	| EnterEnabledAlertDialogCurrentTargetLike
	| EventTarget
	| null;

interface EnterEnabledAlertDialogOpenAutoFocusEventLike {
	currentTarget: EnterEnabledAlertDialogCurrentTarget;
	defaultPrevented: boolean;
	preventDefault: () => void;
}

function isEnterEnabledAlertDialogCurrentTargetLike(
	target: EnterEnabledAlertDialogCurrentTarget,
): target is EnterEnabledAlertDialogCurrentTargetLike {
	return (
		!!target &&
		typeof (target as { querySelector?: unknown }).querySelector === "function"
	);
}

export function focusEnterEnabledAlertDialogPrimaryAction(
	event: EnterEnabledAlertDialogOpenAutoFocusEventLike,
) {
	if (
		event.defaultPrevented ||
		!isEnterEnabledAlertDialogCurrentTargetLike(event.currentTarget)
	) {
		return;
	}

	const primaryAction = event.currentTarget.querySelector(
		alertDialogPrimaryActionSelector,
	);

	if (!primaryAction) {
		return;
	}

	event.preventDefault();
	primaryAction.focus();
}
