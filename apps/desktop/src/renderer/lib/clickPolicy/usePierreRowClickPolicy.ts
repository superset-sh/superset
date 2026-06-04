import { useCallback } from "react";
import { folderIntentFor } from "./policies/folderPolicy";
import type { ClickPolicy } from "./policies/policy";

interface UsePierreRowClickPolicyOptions {
	/** Resolved file-row click policy (settings-driven, e.g. `useSidebarFilePolicy`). */
	filePolicy: ClickPolicy;
	/**
	 * Open a file row's path in the current pane / a new tab. Receives Pierre's
	 * relative path (no trailing slash). Callers needing an absolute path can
	 * join with their own `rootPath`.
	 */
	onSelectFile: (relativePath: string, openInNewTab?: boolean) => void;
	/**
	 * Open the path (file or folder) in the user's external editor. Receives
	 * the row's relative path with any trailing slash stripped.
	 */
	openInExternalEditor: (relativePath: string) => void;
}

interface UsePierreRowClickPolicyResult {
	/** Capture-phase handler — attach to the wrapper holding the `PierreFileTree`. */
	onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
	/** Find the file-row element under a mouse event (skips folder rows). */
	findFileRow: (e: React.MouseEvent) => HTMLElement | null;
}

/**
 * Capture-phase click intercept for `PierreFileTree`. Pierre mounts inside
 * an open shadow root, so we walk `composedPath()` to find the row by its
 * `data-item-path` attribute (stamped by render/rowAttributes.ts in
 * `@pierre/trees`), then route through clickPolicy:
 *
 *   - folder rows → `folderIntentFor` (meta=reveal/no-op, metaShift=external)
 *   - file rows   → settings-driven via the injected `filePolicy`
 *
 * Every resolved action is intercepted (preventDefault + stopPropagation) —
 * we never defer to Pierre's own click → `onSelectionChange` pipeline.
 * Pierre's `selectOnlyPath` no-ops when the clicked row is already selected,
 * which would otherwise silently drop legitimate re-clicks (click-to-pin,
 * reopen after Cmd+W). Pierre's selection is reconciled separately via the
 * reveal flow keyed off the active file pane.
 */
export function usePierreRowClickPolicy({
	filePolicy,
	onSelectFile,
	openInExternalEditor,
}: UsePierreRowClickPolicyOptions): UsePierreRowClickPolicyResult {
	const findRow = useCallback((e: React.MouseEvent): HTMLElement | null => {
		const path = e.nativeEvent.composedPath();
		for (const node of path) {
			if (!(node instanceof HTMLElement)) continue;
			if (node.getAttribute("data-item-path")) return node;
		}
		return null;
	}, []);

	const findFileRow = useCallback(
		(e: React.MouseEvent): HTMLElement | null => {
			const row = findRow(e);
			const itemPath = row?.getAttribute("data-item-path");
			if (!row || !itemPath || itemPath.endsWith("/")) return null;
			return row;
		},
		[findRow],
	);

	const onClickCapture = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const treePath = findRow(e)?.getAttribute("data-item-path");
			if (!treePath) return;
			const trimmed = treePath.endsWith("/") ? treePath.slice(0, -1) : treePath;

			if (treePath.endsWith("/")) {
				const intent = folderIntentFor(e);
				if (intent === null) return;
				e.preventDefault();
				e.stopPropagation();
				if (intent === "external") openInExternalEditor(trimmed);
				// "reveal" is a no-op — the folder row is already in this sidebar.
				return;
			}

			const { action } = filePolicy.resolve(e);
			if (action === null) return;
			// Always intercept — never defer to Pierre's own selection-change
			// pipeline. Pierre's selectOnlyPath no-ops when the clicked row is
			// already selected, which silently drops legitimate re-clicks
			// (e.g. click-to-pin, or reopening a file after Cmd+W).
			e.preventDefault();
			e.stopPropagation();
			if (action === "external") openInExternalEditor(trimmed);
			else if (action === "newTab") onSelectFile(trimmed, true);
			else if (action === "pane") onSelectFile(trimmed, false);
		},
		[filePolicy, onSelectFile, openInExternalEditor, findRow],
	);

	return { onClickCapture, findFileRow };
}
