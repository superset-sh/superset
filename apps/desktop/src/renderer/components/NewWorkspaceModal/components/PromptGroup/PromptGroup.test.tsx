import { describe, expect, test } from "bun:test";
import { parseModuleForKeyDownHandler } from "./test-helpers";

/**
 * Reproduction test for #2454:
 * Cmd+Enter should submit the form from any input, not just the Textarea.
 *
 * The onKeyDown handler for Cmd+Enter was only on the <Textarea> element,
 * so pressing Cmd+Enter while focused on the Branch name <Input> did nothing.
 *
 * The fix moves the handler to the parent <div> wrapper so it captures
 * Cmd+Enter via event bubbling from any child element.
 */
describe("PromptGroup Cmd+Enter keyboard shortcut (#2454)", () => {
	test("onKeyDown handler should be on the parent wrapper element, not only on Textarea", () => {
		const result = parseModuleForKeyDownHandler();

		// The parent wrapper element (the one with className "p-3 space-y-3") should
		// have the onKeyDown handler so Cmd+Enter works from any child
		expect(result.wrapperDivHasOnKeyDown).toBe(true);
	});

	test("Textarea should NOT have its own onKeyDown for Cmd+Enter (moved to parent)", () => {
		const result = parseModuleForKeyDownHandler();

		// The Textarea should no longer have its own onKeyDown handler
		// since the parent div handles it via event bubbling
		expect(result.textareaHasOnKeyDown).toBe(false);
	});
});
