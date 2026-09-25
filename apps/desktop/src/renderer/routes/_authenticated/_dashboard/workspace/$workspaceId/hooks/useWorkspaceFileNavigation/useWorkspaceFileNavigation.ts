import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserPreferencesApi } from "renderer/hooks/useUserPreferences";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isWithinWorkspacePath,
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { FilePaneData, OpenFile, PaneViewerData } from "../../types";
import { setWorkspaceSidebarTab } from "../../utils/setWorkspaceSidebarTab";
import {
	type RecentFile,
	useRecentlyViewedFiles,
} from "../useRecentlyViewedFiles";
import { useRevealInFinder } from "../useRevealInFinder";
import { openFilePaneInStore } from "./utils/openFilePaneInStore";

interface PendingReveal {
	path: string;
	isDirectory: boolean;
}

export function useWorkspaceFileNavigation({
	store,
	setRightSidebarOpen,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	setRightSidebarOpen: UserPreferencesApi["setRightSidebarOpen"];
}): {
	openFilePane: OpenFile;
	openFilePaneFromTreeClick: OpenFile;
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
	const revealInFinder = useRevealInFinder(workspace.id);
	const collections = useCollections();

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

	const openFilePane = useCallback<OpenFile>(
		(filePath, openInNewTab, position) => {
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
			openFilePaneInStore(store, absoluteFilePath, openInNewTab, position);
		},
		[store, worktreePath, recordView],
	);

	// User-facing file opens from the workspace sidebar layer the VS-Code-style
	// "click an already-active row to pin it" pattern on top of openFilePane.
	const openFilePaneFromTreeClick = useCallback<OpenFile>(
		(filePath, openInNewTab, position) => {
			if (openInNewTab || position) {
				openFilePane(filePath, openInNewTab, position);
				return;
			}
			const absoluteFilePath = worktreePath
				? toAbsoluteWorkspacePath(worktreePath, filePath)
				: filePath;
			const state = store.getState();
			const active = state.getActivePane();
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === absoluteFilePath
			) {
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}
			openFilePane(filePath);
		},
		[openFilePane, store, worktreePath],
	);

	const revealPath = useCallback(
		(path: string, options?: { isDirectory?: boolean }) => {
			const isDirectory = options?.isDirectory === true;
			// The sidebar file tree only spans the worktree; paths outside it
			// (e.g. a ~/some/dir link from the terminal) are revealed in Finder.
			if (worktreePath && !isWithinWorkspacePath(worktreePath, path)) {
				revealInFinder(path, { isDirectory });
				return;
			}
			setRightSidebarOpen(true);
			// Switch the sidebar's tab too, or the reveal lands behind Changes/Review.
			setWorkspaceSidebarTab(collections, workspace.id, "files");
			setSelectedFilePath(path);
			setPendingReveal({ path, isDirectory });
		},
		[
			setRightSidebarOpen,
			worktreePath,
			revealInFinder,
			collections,
			workspace.id,
		],
	);

	return {
		openFilePane,
		openFilePaneFromTreeClick,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	};
}
