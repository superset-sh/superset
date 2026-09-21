import { describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	installTerminalCopyHandler,
	trimTerminalSelection,
} from "./terminal-copy";

describe("trimTerminalSelection", () => {
	it("removes trailing row padding", () => {
		expect(trimTerminalSelection("foo   \nbar  ")).toBe("foo\nbar");
	});

	it("preserves indentation and blank lines", () => {
		expect(trimTerminalSelection("  first  \n   \n  last")).toBe(
			"  first\n\n  last",
		);
	});
});

describe("installTerminalCopyHandler", () => {
	it("writes the normalized selection to the copy event", () => {
		let listener: ((event: ClipboardEvent) => void) | undefined;
		const removeEventListener = mock(() => {});
		const terminal = {
			element: {
				addEventListener: (_type: string, callback: EventListener) => {
					listener = callback as (event: ClipboardEvent) => void;
				},
				removeEventListener,
			},
			getSelection: () => "foo   \nbar  ",
		} as unknown as XTerm;
		const preventDefault = mock(() => {});
		const setData = mock(() => {});

		const dispose = installTerminalCopyHandler(terminal);
		listener?.({
			clipboardData: { setData },
			preventDefault,
		} as unknown as ClipboardEvent);

		expect(preventDefault).toHaveBeenCalled();
		expect(setData).toHaveBeenCalledWith("text/plain", "foo\nbar");

		dispose();
		expect(removeEventListener).toHaveBeenCalledWith("copy", listener);
	});

	it("leaves copy events alone when nothing is selected", () => {
		let listener: ((event: ClipboardEvent) => void) | undefined;
		const terminal = {
			element: {
				addEventListener: (_type: string, callback: EventListener) => {
					listener = callback as (event: ClipboardEvent) => void;
				},
				removeEventListener: () => {},
			},
			getSelection: () => "",
		} as unknown as XTerm;
		const preventDefault = mock(() => {});

		installTerminalCopyHandler(terminal);
		listener?.({ preventDefault } as unknown as ClipboardEvent);

		expect(preventDefault).not.toHaveBeenCalled();
	});

	it("uses the clipboard API without canceling the default copy fallback", async () => {
		let listener: ((event: ClipboardEvent) => void) | undefined;
		const terminal = {
			element: {
				addEventListener: (_type: string, callback: EventListener) => {
					listener = callback as (event: ClipboardEvent) => void;
				},
				removeEventListener: () => {},
			},
			getSelection: () => "foo   \nbar  ",
		} as unknown as XTerm;
		const preventDefault = mock(() => {});
		const writeText = mock(() => Promise.resolve());
		const previousNavigator = Object.getOwnPropertyDescriptor(
			globalThis,
			"navigator",
		);
		Object.defineProperty(globalThis, "navigator", {
			value: { clipboard: { writeText } },
			configurable: true,
		});

		try {
			installTerminalCopyHandler(terminal);
			listener?.({ preventDefault } as unknown as ClipboardEvent);
			await Promise.resolve();

			expect(writeText).toHaveBeenCalledWith("foo\nbar");
			expect(preventDefault).not.toHaveBeenCalled();
		} finally {
			if (previousNavigator) {
				Object.defineProperty(globalThis, "navigator", previousNavigator);
			}
		}
	});
});
