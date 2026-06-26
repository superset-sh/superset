import { isEnterSubmit, isImeComposing } from "@superset/ui/lib/keyboard";

export interface HandleEnterKeyDownDeps {
	getEditorDom: () => Element | null;
	isComposing: () => boolean;
	isSlashOpen: () => boolean;
	isMentionOpen: () => boolean;
}

// Submit the surrounding form when the user presses Enter (without Shift).
// Returning `true` consumes the event; returning `false` lets ProseMirror
// continue normal processing — including the HardBreak extension's own
// `Shift-Enter` keymap binding which inserts a newline.
//
// We gate the submit path on an explicit `event.shiftKey` check (via
// `isEnterSubmit`) so the bug in issue #4202 — Shift+Enter submitting the
// chat — cannot reappear by relying on prosemirror-keymap's modifier match.
export function handleEnterKeyDown(
	event: KeyboardEvent,
	deps: HandleEnterKeyDownDeps,
): boolean {
	if (event.key !== "Enter") return false;

	if (deps.isComposing() || isImeComposing(event)) return false;

	if (deps.isSlashOpen() || deps.isMentionOpen()) return false;

	if (!isEnterSubmit(event)) return false;

	const dom = deps.getEditorDom();
	const form = dom?.closest("form") ?? null;
	if (!form) return false;

	const submitBtn = form.querySelector<HTMLButtonElement>(
		'button[type="submit"]',
	);
	event.preventDefault();
	if (submitBtn?.disabled) return true;
	form.requestSubmit();
	return true;
}
