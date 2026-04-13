import { describe, expect, it, mock } from "bun:test";
import {
	handleTerminalClipboardShortcut,
	isTerminalCopyShortcut,
	isTerminalPasteShortcut,
} from "./clipboardShortcuts";

describe("terminal clipboard shortcuts", () => {
	it("detects plain Cmd+C and Cmd+V on macOS", () => {
		expect(
			isTerminalCopyShortcut(
				{
					key: "c",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"macintel",
			),
		).toBe(true);
		expect(
			isTerminalPasteShortcut(
				{
					key: "v",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"macintel",
			),
		).toBe(true);
	});

	it("does not treat Cmd+Shift+C as a terminal clipboard shortcut", () => {
		expect(
			isTerminalCopyShortcut(
				{
					key: "c",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: true,
				},
				"macintel",
			),
		).toBe(false);
	});

	it("handles copy by preventing default and invoking the copy callback", () => {
		const preventDefault = mock(() => {});
		const stopPropagation = mock(() => {});
		const onCopy = mock(() => {});
		const onPaste = mock(() => {});

		const handled = handleTerminalClipboardShortcut(
			{
				key: "c",
				metaKey: true,
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				preventDefault,
				stopPropagation,
			},
			"macintel",
			{ onCopy, onPaste },
		);

		expect(handled).toBe(true);
		expect(preventDefault).toHaveBeenCalledTimes(1);
		expect(stopPropagation).toHaveBeenCalledTimes(1);
		expect(onCopy).toHaveBeenCalledTimes(1);
		expect(onPaste).not.toHaveBeenCalled();
	});

	it("handles paste by preventing default and invoking the paste callback", () => {
		const preventDefault = mock(() => {});
		const stopPropagation = mock(() => {});
		const onCopy = mock(() => {});
		const onPaste = mock(() => {});

		const handled = handleTerminalClipboardShortcut(
			{
				key: "v",
				metaKey: true,
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				preventDefault,
				stopPropagation,
			},
			"macintel",
			{ onCopy, onPaste },
		);

		expect(handled).toBe(true);
		expect(preventDefault).toHaveBeenCalledTimes(1);
		expect(stopPropagation).toHaveBeenCalledTimes(1);
		expect(onPaste).toHaveBeenCalledTimes(1);
		expect(onCopy).not.toHaveBeenCalled();
	});

	it("does not change non-mac ctrl shortcuts", () => {
		const handled = handleTerminalClipboardShortcut(
			{
				key: "c",
				metaKey: false,
				ctrlKey: true,
				altKey: false,
				shiftKey: false,
				preventDefault: () => {},
				stopPropagation: () => {},
			},
			"linux x86_64",
			{ onCopy: () => {}, onPaste: () => {} },
		);

		expect(handled).toBe(false);
	});
});
