import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useChangesTab } from "../../../../components/WorkspaceSidebar/hooks/useChangesTab";
import type {
	DiffPaneData,
	FilePaneData,
	PaneViewerData,
} from "../../../../types";
import { openBesidePane } from "../../../../utils/openBesidePane";
import { useDiffPaneTarget } from "../../../useDiffPaneTarget";

interface ChangesListPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function ChangesListPane({
	context,
	workspaceId,
}: ChangesListPaneProps) {
	const { store } = context;
	const paneId = context.pane.id;
	const selectedDiffTarget = useDiffPaneTarget(store);

	const handleSelectFile = useCallback(
		(path: string, openInNewTab?: boolean, changeKey?: string) => {
			openBesidePane(
				store,
				paneId,
				{
					kind: "diff",
					data: {
						path,
						changeKey,
						collapsedFiles: [],
						focusTick: Date.now(),
					} as DiffPaneData,
				},
				openInNewTab,
			);
		},
		[store, paneId],
	);

	const handleOpenFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			openBesidePane(
				store,
				paneId,
				{ kind: "file", data: { filePath, mode: "editor" } as FilePaneData },
				openInNewTab,
			);
		},
		[store, paneId],
	);

	const changesTab = useChangesTab({
		workspaceId,
		selectedDiffTarget,
		onSelectFile: handleSelectFile,
		onOpenFile: handleOpenFile,
	});

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			{changesTab.content}
		</div>
	);
}
