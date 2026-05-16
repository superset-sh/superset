import { useCallback } from "react";
import type { ChangesSidebarFileIntent } from "./policies/changesSidebarFilePolicy";
import { folderIntentFor } from "./policies/folderPolicy";
import type { ModifierEvent } from "./types";

interface UsePierreChangesSidebarRowClickPolicyOptions {
	getFileIntent: (event: ModifierEvent) => ChangesSidebarFileIntent | null;
	onSelectDiff: (relativePath: string, openInNewTab?: boolean) => void;
	onOpenFile: (relativePath: string, openInNewTab?: boolean) => void;
	openInExternalEditor: (relativePath: string) => void;
}

interface UsePierreChangesSidebarRowClickPolicyResult {
	onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
	findFileRow: (e: React.MouseEvent) => HTMLElement | null;
}

export function usePierreChangesSidebarRowClickPolicy({
	getFileIntent,
	onSelectDiff,
	onOpenFile,
	openInExternalEditor,
}: UsePierreChangesSidebarRowClickPolicyOptions): UsePierreChangesSidebarRowClickPolicyResult {
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
				return;
			}

			const intent = getFileIntent(e);
			if (intent === null) return;

			e.preventDefault();
			e.stopPropagation();

			if (intent === "external") openInExternalEditor(trimmed);
			else if (intent === "file") onOpenFile(trimmed, false);
			else if (intent === "diffNewTab") onSelectDiff(trimmed, true);
			else if (intent === "diff") onSelectDiff(trimmed, false);
		},
		[findRow, getFileIntent, onSelectDiff, onOpenFile, openInExternalEditor],
	);

	return { onClickCapture, findFileRow };
}
