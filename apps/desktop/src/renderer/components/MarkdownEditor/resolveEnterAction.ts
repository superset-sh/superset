// Decides what an Enter / Shift+Enter keypress should do inside the markdown
// editor when a submit handler (`onEnter`) is wired up. Kept as a pure function
// so the policy is unit-testable without a DOM / ProseMirror instance.
//
// Policy (matches the in-workspace chat composer, TiptapPromptEditor):
//   Enter        → submit
//   Shift+Enter  → newline
// When no submit handler is provided, Enter falls back to the editor default
// (a new paragraph), and during IME composition or while a suggestion menu is
// open the key is left for those handlers.
export type EnterAction = "submit" | "newline" | "ignore";

export type ResolveEnterActionOptions = {
	shiftKey: boolean;
	// Whether the editor has an `onEnter` submit handler wired up.
	hasSubmitHandler: boolean;
	// True while an IME composition is in progress.
	isComposing?: boolean;
	// True while a slash / emoji / mention suggestion menu is handling keys.
	isSuggestionOpen?: boolean;
};

export const resolveEnterAction = ({
	shiftKey,
	hasSubmitHandler,
	isComposing = false,
	isSuggestionOpen = false,
}: ResolveEnterActionOptions): EnterAction => {
	// No submit handler: preserve the editor's default Enter behavior.
	if (!hasSubmitHandler) return "ignore";
	// Defer to IME composition and open suggestion menus.
	if (isComposing || isSuggestionOpen) return "ignore";
	// Shift+Enter always inserts a line break.
	if (shiftKey) return "newline";
	return "submit";
};
