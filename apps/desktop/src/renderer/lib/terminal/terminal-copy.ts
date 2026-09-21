import type { Terminal as XTerm } from "@xterm/xterm";

/** Removes terminal row padding while preserving indentation and line breaks. */
export function trimTerminalSelection(selection: string): string {
	return selection
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n");
}

/** Writes normalized terminal selections for browser and Electron copy events. */
export function installTerminalCopyHandler(terminal: XTerm): () => void {
	const element = terminal.element;
	if (!element) return () => {};

	const handleCopy = (event: ClipboardEvent) => {
		const selection = terminal.getSelection();
		if (!selection) return;

		const text = trimTerminalSelection(selection);
		if (event.clipboardData) {
			event.preventDefault();
			event.clipboardData.setData("text/plain", text);
			return;
		}

		void navigator.clipboard?.writeText(text).catch(() => {});
	};

	element.addEventListener("copy", handleCopy);
	return () => element.removeEventListener("copy", handleCopy);
}
