import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Parse PromptGroup.tsx source to check where the onKeyDown handler lives.
 *
 * We use static analysis (source code parsing) rather than rendering,
 * because PromptGroup has heavy dependencies (Electron tRPC, router, stores)
 * that cannot be easily mocked in a unit test. Static analysis is sufficient
 * to verify the structural fix for issue #2454.
 */
export function parseModuleForKeyDownHandler(): {
	wrapperDivHasOnKeyDown: boolean;
	textareaHasOnKeyDown: boolean;
} {
	const source = readFileSync(join(__dirname, "PromptGroup.tsx"), "utf-8");

	// Find the wrapper element (form/div with "p-3 space-y-3") and check if
	// onKeyDown appears between that element's opening tag and the <Textarea.
	// This confirms the handler is on the wrapper, not on a child element.
	const wrapperStart = source.indexOf("p-3 space-y-3");
	const textareaStart = source.indexOf("<Textarea");
	const regionBeforeTextarea =
		wrapperStart >= 0 && textareaStart > wrapperStart
			? source.slice(wrapperStart, textareaStart)
			: "";
	const wrapperDivHasOnKeyDown = /onKeyDown/.test(regionBeforeTextarea);

	// Check if <Textarea has its own onKeyDown
	// Extract the Textarea JSX element and look for onKeyDown within it
	const textareaEnd = source.indexOf("/>", textareaStart);
	const textareaElement =
		textareaStart >= 0 && textareaEnd > textareaStart
			? source.slice(textareaStart, textareaEnd + 2)
			: "";
	const textareaHasOnKeyDown = /onKeyDown/.test(textareaElement);

	return { wrapperDivHasOnKeyDown, textareaHasOnKeyDown };
}
