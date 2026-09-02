import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { installCopyOnSelect, trimSelectionForCopy } from "./copyOnSelect";

function stubClipboard(writeText: (text: string) => Promise<void>) {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	Object.defineProperty(globalThis, "navigator", {
		value: { clipboard: { writeText } },
		configurable: true,
		writable: true,
	});
	return () => {
		if (previous) Object.defineProperty(globalThis, "navigator", previous);
	};
}

function stubFocus(hasFocus: boolean) {
	const doc = globalThis.document as unknown as {
		hasFocus?: () => boolean;
	};
	const previous = doc.hasFocus;
	doc.hasFocus = () => hasFocus;
	return () => {
		doc.hasFocus = previous;
	};
}

function createTerminalStub(selection: string) {
	let onSelection: (() => void) | undefined;
	const dispose = mock(() => {});
	const terminal = {
		getSelection: () => selection,
		onSelectionChange: (callback: () => void) => {
			onSelection = callback;
			return { dispose };
		},
	} as unknown as XTerm;
	return {
		terminal,
		dispose,
		fireSelectionChange: () => onSelection?.(),
	};
}

const restores: Array<() => void> = [];

afterEach(() => {
	while (restores.length > 0) restores.pop()?.();
});

describe("trimSelectionForCopy", () => {
	it("trims the padding xterm reports at the end of each row", () => {
		expect(trimSelectionForCopy("foo   \nbar  ")).toBe("foo\nbar");
	});

	it("keeps leading whitespace, which is real indentation", () => {
		expect(trimSelectionForCopy("  indented   ")).toBe("  indented");
	});

	it("keeps blank lines inside the selection", () => {
		expect(trimSelectionForCopy("first  \n   \nlast")).toBe("first\n\nlast");
	});
});

describe("installCopyOnSelect", () => {
	it("copies the trimmed selection when the selection changes", async () => {
		const writeText = mock(() => Promise.resolve());
		restores.push(stubClipboard(writeText), stubFocus(true));

		const { terminal, fireSelectionChange } = createTerminalStub("foo   \nbar");
		installCopyOnSelect(terminal);
		fireSelectionChange();
		await Promise.resolve();

		expect(writeText).toHaveBeenCalledWith("foo\nbar");
	});

	it("ignores a cleared selection", async () => {
		const writeText = mock(() => Promise.resolve());
		restores.push(stubClipboard(writeText), stubFocus(true));

		const { terminal, fireSelectionChange } = createTerminalStub("");
		installCopyOnSelect(terminal);
		fireSelectionChange();
		await Promise.resolve();

		expect(writeText).not.toHaveBeenCalled();
	});

	it("skips the write when the window is not focused", async () => {
		const writeText = mock(() => Promise.resolve());
		restores.push(stubClipboard(writeText), stubFocus(false));

		const { terminal, fireSelectionChange } = createTerminalStub("hello");
		installCopyOnSelect(terminal);
		fireSelectionChange();
		await Promise.resolve();

		expect(writeText).not.toHaveBeenCalled();
	});

	it("skips a repeat event that leaves the selection unchanged", async () => {
		const writeText = mock(() => Promise.resolve());
		restores.push(stubClipboard(writeText), stubFocus(true));

		const { terminal, fireSelectionChange } = createTerminalStub("hello");
		installCopyOnSelect(terminal);
		fireSelectionChange();
		fireSelectionChange();
		await Promise.resolve();

		expect(writeText).toHaveBeenCalledTimes(1);
	});

	it("retries the same text after a rejected write", async () => {
		const writeText = mock(() => Promise.reject(new Error("denied")));
		restores.push(stubClipboard(writeText), stubFocus(true));

		const { terminal, fireSelectionChange } = createTerminalStub("hello");
		installCopyOnSelect(terminal);
		fireSelectionChange();
		await Promise.resolve();
		fireSelectionChange();
		await Promise.resolve();

		expect(writeText).toHaveBeenCalledTimes(2);
	});

	it("reports each copy so the pane can flash its indicator", async () => {
		const writeText = mock(() => Promise.resolve());
		restores.push(stubClipboard(writeText), stubFocus(true));

		const onCopied = mock(() => {});
		let selection = "hello";
		let fire: (() => void) | undefined;
		const terminal = {
			getSelection: () => selection,
			onSelectionChange: (callback: () => void) => {
				fire = callback;
				return { dispose: () => {} };
			},
		} as unknown as XTerm;

		installCopyOnSelect(terminal, onCopied);
		fire?.();
		await Promise.resolve();
		expect(onCopied).toHaveBeenCalledTimes(1);

		// A repeat event with the same selection copies nothing, so it must not
		// re-flash the indicator either.
		fire?.();
		await Promise.resolve();
		expect(onCopied).toHaveBeenCalledTimes(1);

		selection = "hello there";
		fire?.();
		await Promise.resolve();
		expect(onCopied).toHaveBeenCalledTimes(2);
	});

	it("does not report a copy when the clipboard write is rejected", async () => {
		const writeText = mock(() => Promise.reject(new Error("denied")));
		restores.push(stubClipboard(writeText), stubFocus(true));

		const onCopied = mock(() => {});
		const { terminal, fireSelectionChange } = createTerminalStub("hello");
		installCopyOnSelect(terminal, onCopied);
		fireSelectionChange();
		await Promise.resolve();
		await Promise.resolve();

		expect(onCopied).not.toHaveBeenCalled();
	});

	it("disposes the selection listener on cleanup", () => {
		const writeText = mock(() => Promise.resolve());
		restores.push(stubClipboard(writeText), stubFocus(true));

		const { terminal, dispose } = createTerminalStub("hello");
		installCopyOnSelect(terminal)();

		expect(dispose).toHaveBeenCalled();
	});
});
