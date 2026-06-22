import { describe, expect, test } from "bun:test";

import { resolveEnterAction } from "./resolveEnterAction";

// Reproduces issue #5263: the New Workspace prompt (MarkdownEditor) should
// submit on plain Enter and insert a newline on Shift+Enter, matching the chat
// composer — instead of requiring Cmd/Ctrl+Enter.
describe("resolveEnterAction", () => {
	test("plain Enter submits when a submit handler is wired up", () => {
		expect(
			resolveEnterAction({ shiftKey: false, hasSubmitHandler: true }),
		).toBe("submit");
	});

	test("Shift+Enter inserts a newline", () => {
		expect(resolveEnterAction({ shiftKey: true, hasSubmitHandler: true })).toBe(
			"newline",
		);
	});

	test("without a submit handler, Enter keeps the editor default", () => {
		expect(
			resolveEnterAction({ shiftKey: false, hasSubmitHandler: false }),
		).toBe("ignore");
		expect(
			resolveEnterAction({ shiftKey: true, hasSubmitHandler: false }),
		).toBe("ignore");
	});

	test("IME composition is left to the composition handler", () => {
		expect(
			resolveEnterAction({
				shiftKey: false,
				hasSubmitHandler: true,
				isComposing: true,
			}),
		).toBe("ignore");
	});

	test("an open suggestion menu takes precedence over submit", () => {
		expect(
			resolveEnterAction({
				shiftKey: false,
				hasSubmitHandler: true,
				isSuggestionOpen: true,
			}),
		).toBe("ignore");
	});
});
