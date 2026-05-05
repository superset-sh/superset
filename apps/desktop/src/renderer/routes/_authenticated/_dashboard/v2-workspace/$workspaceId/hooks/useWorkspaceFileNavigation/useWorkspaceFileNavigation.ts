import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { V2UserPreferencesApi } from "renderer/hooks/useV2UserPreferences";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { FilePaneData, PaneViewerData } from "../../types";
import {
	type RecentFile,
	useRecentlyViewedFiles,
} from "../useRecentlyViewedFiles";

interface PendingReveal {
	path: string;
	isDirectory: boolean;
}

export function useWorkspaceFileNavigation({
	store,
	setRightSidebarOpen,
	setRightSidebarTab,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	setRightSidebarOpen: V2UserPreferencesApi["setRightSidebarOpen"];
	setRightSidebarTab: V2UserPreferencesApi["setRightSidebarTab"];
}): {
	openFilePane: (filePath: string, openInNewTab?: boolean) => void;
	revealPath: (
		path: string,
		options?: {
			isDirectory?: boolean;
		},
	) => void;
	selectedFilePath: string | undefined;
	pendingReveal: PendingReveal | null;
	recentFiles: RecentFile[];
	openFilePaths: Set<string>;
} {
	const { workspace } = useWorkspace();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspace.id,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? "";

	const { recentFiles, recordView } = useRecentlyViewedFiles(workspace.id);

	const activeFilePanePath = useStore(store, (state) => {
		const tab = state.tabs.find(
			(candidate) => candidate.id === state.activeTabId,
		);
		if (!tab?.activePaneId) return undefined;
		const pane = tab.panes[tab.activePaneId];
		if (pane?.kind === "file") return (pane.data as FilePaneData).filePath;
		return undefined;
	});

	const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(
		activeFilePanePath,
	);
	// Every reveal request is a fresh object, so the FilesTab effect keyed on
	// `pendingReveal` re-runs even when the path is the same (for example, the
	// user collapsed a folder and re-requested it from the terminal).
	const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(
		null,
	);

	useEffect(() => {
		if (activeFilePanePath !== undefined) {
			setSelectedFilePath(activeFilePanePath);
			setPendingReveal({ path: activeFilePanePath, isDirectory: false });
		}
	}, [activeFilePanePath]);

	const openFilePathsKey = useStore(store, (state) =>
		state.tabs
			.flatMap((tab) =>
				Object.values(tab.panes)
					.filter((pane) => pane.kind === "file")
					.map((pane) => (pane.data as FilePaneData).filePath),
			)
			.join("\u0000"),
	);
	const openFilePaths = useMemo(
		() => new Set(openFilePathsKey ? openFilePathsKey.split("\u0000") : []),
		[openFilePathsKey],
	);

	const openFilePane = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			const absoluteFilePath = worktreePath
				? toAbsoluteWorkspacePath(worktreePath, filePath)
				: filePath;
			if (worktreePath) {
				const relativePath = toRelativeWorkspacePath(
					worktreePath,
					absoluteFilePath,
				);
				if (relativePath && relativePath !== ".") {
					recordView({ relativePath, absolutePath: absoluteFilePath });
				}
			}
			const state = store.getState();
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "file",
							data: {
								filePath: absoluteFilePath,
								mode: "editor",
							} as FilePaneData,
						},
					],
				});
				return;
			}
			const active = state.getActivePane();
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === absoluteFilePath
			) {
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}
			state.openPane({
				pane: {
					kind: "file",
					data: {
						filePath: absoluteFilePath,
						mode: "editor",
					} as FilePaneData,
				},
			});
		},
		[store, worktreePath, recordView],
	);

	const revealPath = useCallback(
		(path: string, options?: { isDirectory?: boolean }) => {
			setRightSidebarOpen(true);
			setRightSidebarTab("files");
			setSelectedFilePath(path);
			setPendingReveal({ path, isDirectory: options?.isDirectory === true });
		},
		[setRightSidebarOpen, setRightSidebarTab],
	);

	return {
		openFilePane,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	};
}
