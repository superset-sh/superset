import type { WorkspaceProps } from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import { useCallback } from "react";
import { getBaseName } from "renderer/lib/pathBasename";
import { getDocument } from "../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../types";

type OnBeforeCloseTab = NonNullable<
	WorkspaceProps<PaneViewerData>["onBeforeCloseTab"]
>;

export function useDirtyTabCloseGuard({
	workspaceId,
}: {
	workspaceId: string;
}): OnBeforeCloseTab {
	return useCallback<OnBeforeCloseTab>(
		(tab) => {
			const dirtyPanes = Object.values(tab.panes).filter((pane) => {
				if (pane.kind !== "file") return false;
				const filePath = (pane.data as FilePaneData).filePath;
				return getDocument(workspaceId, filePath)?.dirty === true;
			});
			const dirtyFileNames = dirtyPanes.map((pane) =>
				getBaseName((pane.data as FilePaneData).filePath),
			);
			if (dirtyPanes.length === 0) return true;
			const title =
				dirtyPanes.length === 1
					? `Do you want to save the changes you made to ${dirtyFileNames[0]}?`
					: `Do you want to save changes to ${dirtyPanes.length} files?`;
			return new Promise<boolean>((resolve) => {
				alert({
					title,
					description: "Your changes will be lost if you don't save them.",
					actions: [
						{
							label: "Save All",
							onClick: async () => {
								for (const pane of dirtyPanes) {
									const filePath = (pane.data as FilePaneData).filePath;
									const doc = getDocument(workspaceId, filePath);
									if (!doc) continue;
									const result = await doc.save();
									if (result.status !== "saved") {
										resolve(false);
										return;
									}
								}
								resolve(true);
							},
						},
						{
							label: "Don't Save",
							variant: "secondary",
							onClick: async () => {
								for (const pane of dirtyPanes) {
									const filePath = (pane.data as FilePaneData).filePath;
									const doc = getDocument(workspaceId, filePath);
									if (doc) await doc.reload();
								}
								resolve(true);
							},
						},
						{
							label: "Cancel",
							variant: "ghost",
							onClick: () => resolve(false),
						},
					],
				});
			});
		},
		[workspaceId],
	);
}
