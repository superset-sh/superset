import { isEnterSubmit, isImeComposing } from "@superset/ui/lib/keyboard";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type AnyKeyboardEvent = KeyboardEvent | ReactKeyboardEvent;

// Keyboard actions available while the new-workspace modal is open.
//
// - "create" — submit the modal (Cmd/Ctrl+Enter), the long-standing binding.
// - "open-github-issue" — open the GitHub issue picker popover (Cmd/Ctrl+I).
// - "open-pr" — open the pull-request picker popover (Cmd/Ctrl+P).
//
// The picker shortcuts close issue #5149: previously the attach-reference
// popovers (GitHub issue / PR) were reachable only by clicking the
// AttachmentButtons, with no keyboard affordance.
export type NewWorkspaceShortcutAction =
	| "create"
	| "open-github-issue"
	| "open-pr";

// Map a keydown event to a new-workspace modal action, or null when the event
// is not one of our shortcuts.
//
// We match the attach-reference shortcuts on `event.code` (the physical key,
// e.g. "KeyI"/"KeyP") rather than `event.key`, because `key` shifts with the
// keyboard layout (see lib/terminal/line-edit-translations.ts) — `code` keeps
// the bindings stable across non-QWERTY layouts.
export const resolveNewWorkspaceShortcut = (
	e: AnyKeyboardEvent,
): NewWorkspaceShortcutAction | null => {
	// Cmd/Ctrl+Enter submits. isEnterSubmit already guards IME composition.
	if (isEnterSubmit(e, { requireMod: true })) return "create";

	const mod = e.metaKey || e.ctrlKey;
	if (!mod) return null;
	// Plain Cmd/Ctrl+letter only; leave Shift/Alt combos for other handlers.
	if (e.shiftKey || e.altKey) return null;
	if (isImeComposing(e)) return null;

	if (e.code === "KeyI") return "open-github-issue";
	if (e.code === "KeyP") return "open-pr";

	return null;
};
