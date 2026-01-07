import type * as Monaco from "monaco-editor";
import { monaco } from "renderer/contexts/MonacoProvider";

/**
 * Registers a keyboard shortcut (Cmd+Shift+C / Ctrl+Shift+C) to copy
 * the file path with the current line number(s) to the clipboard.
 *
 * Format: `path/to/file.ts:42` or `path/to/file.ts:42-50` for multi-line selections
 */
export function registerCopyPathLineAction(
	editor: Monaco.editor.IStandaloneCodeEditor,
	filePath: string,
) {
	editor.addAction({
		id: "copy-path-line",
		label: "Copy Path:Line",
		keybindings: [
			monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC,
		],
		run: (ed) => {
			const selection = ed.getSelection();
			if (!selection) return;

			const { startLineNumber, endLineNumber } = selection;
			const pathWithLine =
				startLineNumber === endLineNumber
					? `${filePath}:${startLineNumber}`
					: `${filePath}:${startLineNumber}-${endLineNumber}`;

			navigator.clipboard.writeText(pathWithLine);
		},
	});
}
