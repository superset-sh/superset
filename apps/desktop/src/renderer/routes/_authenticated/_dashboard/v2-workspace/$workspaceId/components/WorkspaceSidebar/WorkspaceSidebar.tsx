import { useLingui } from "@lingui/react/macro";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef, useState } from "react";
import { LuFile } from "react-icons/lu";
import { getChangesetFileKey } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useWorkspaceGitStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	WORKSPACE_SIDEBAR_TABS,
	type WorkspaceSidebarTab,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useSettings } from "renderer/stores/settings";
import { useRowlessSidebarTabStore } from "../../state/rowlessSidebarTabStore";
import type { CommentPaneData, DiffFocusSide } from "../../types";
import {
	DEFAULT_WORKSPACE_SIDEBAR_TAB,
	setWorkspaceSidebarTab,
} from "../../utils/setWorkspaceSidebarTab";
import { FilesTab } from "./components/FilesTab";
import { PRActionHeader } from "./components/PRActionHeader";
import { SidebarHeader } from "./components/SidebarHeader";
import { type SelectedDiffTarget, useChangesTab } from "./hooks/useChangesTab";
import { useReviewTab } from "./hooks/useReviewTab";
import type { SidebarTabDefinition } from "./types";

const LABELLED_TAB_WIDTH = 88;
const LABEL_HYSTERESIS = 20;

type SidebarTabId = WorkspaceSidebarTab;

function isSidebarTabId(tab: string): tab is SidebarTabId {
	return (WORKSPACE_SIDEBAR_TABS as readonly string[]).includes(tab);
}

export interface PendingReveal {
	path: string;
	isDirectory: boolean;
}

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onSelectDiffFile?: (
		path: string,
		openInNewTab?: boolean,
		line?: number,
		side?: DiffFocusSide,
		changeKey?: string,
	) => void;
	onOpenComment?: (comment: CommentPaneData) => void;
	onSearch?: () => void;
	selectedFilePath?: string;
	/** The diff pane's current file, highlighted in the Changes tab. */
	selectedDiffTarget?: SelectedDiffTarget;
	pendingReveal?: PendingReveal | null;
	workspaceId: string;
}

export function WorkspaceSidebar({
	onSelectFile,
	onSelectDiffFile,
	onOpenComment,
	onSearch,
	selectedFilePath,
	selectedDiffTarget,
	pendingReveal,
	workspaceId,
}: WorkspaceSidebarProps) {
	const { t } = useLingui();
	const gitStatus = useWorkspaceGitStatus();
	const collections = useCollections();
	const { data: [localState] = [] } = useLiveQuery(
		(query) =>
			query
				.from({ localState: collections.v2WorkspaceLocalState })
				.where(({ localState }) => eq(localState.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	// Workspaces without a local row (auto-included local mains) keep their
	// tab in the session-only fallback that setWorkspaceSidebarTab writes.
	const rowlessTab = useRowlessSidebarTabStore((s) => s.tabs[workspaceId]);
	const clearRowlessTab = useRowlessSidebarTabStore((s) => s.clearTab);
	// The live query can lag a render when the workspace switches; a row that
	// still belongs to the previous workspace must not speak for this one.
	const row = localState?.workspaceId === workspaceId ? localState : undefined;
	const activeTab: SidebarTabId =
		row && isSidebarTabId(row.sidebarState.activeTab)
			? row.sidebarState.activeTab
			: (rowlessTab ?? DEFAULT_WORKSPACE_SIDEBAR_TAB);

	// A row created while a rowless choice is pending (pinning a local main)
	// starts on the default tab: carry the choice into the row once, then
	// drop the session entry so it can't resurface if the row goes away.
	const hasRow = row != null;
	useEffect(() => {
		if (!hasRow || rowlessTab === undefined) return;
		setWorkspaceSidebarTab(collections, workspaceId, rowlessTab);
		clearRowlessTab(workspaceId);
	}, [hasRow, rowlessTab, collections, workspaceId, clearRowlessTab]);

	function setActiveTab(tab: string) {
		if (!isSidebarTabId(tab)) return;
		setWorkspaceSidebarTab(collections, workspaceId, tab);
	}

	const containerRef = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);

	const changesTab = useChangesTab({
		workspaceId,
		selectedDiffTarget,
		onSelectFile: onSelectDiffFile
			? (path, openInNewTab, changeKey) =>
					onSelectDiffFile(path, openInNewTab, undefined, undefined, changeKey)
			: undefined,
		onOpenFile: onSelectFile,
	});

	// PR review comments are always relative to the base branch, so they map
	// onto the "against-base" source group — matching the same query (and
	// changeKey format) the Changes pane uses for that group lets us disambiguate
	// a path that also has staged/unstaged edits, instead of falling back to
	// "first item whose path matches" and landing on the wrong group.
	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	const reviewTab = useReviewTab({
		workspaceId,
		onOpenComment,
		onOpenInDiff: onSelectDiffFile
			? (path, line, openInNewTab, side) => {
					// Force annotations on so the user lands on the comment, not an empty line.
					useSettings.getState().update("showDiffComments", true);
					// Only disambiguate once the real base branch is known — while
					// baseBranchQuery is still loading, omit changeKey so this falls
					// back to the old (safe) "first item whose path matches" behavior
					// instead of building a changeKey with a guessed-empty base branch
					// that won't match the real item once it resolves.
					const changeKey = baseBranchQuery.isSuccess
						? getChangesetFileKey({
								path,
								status: "modified",
								additions: 0,
								deletions: 0,
								source: {
									kind: "against-base",
									baseBranch: baseBranchQuery.data.baseBranch,
								},
							})
						: undefined;
					onSelectDiffFile(path, openInNewTab ?? false, line, side, changeKey);
				}
			: undefined,
	});

	const filesTab: SidebarTabDefinition = {
		id: "files",
		label: t({ message: "Files" }),
		icon: LuFile,
		content: (
			<FilesTab
				onSelectFile={onSelectFile}
				selectedFilePath={selectedFilePath}
				pendingReveal={pendingReveal}
				workspaceId={workspaceId}
				gitStatus={gitStatus.data}
				onSearch={onSearch}
			/>
		),
	};

	const tabs: SidebarTabDefinition[] = [filesTab, changesTab, reviewTab];
	const activeTabDef = tabs.find((t) => t.id === activeTab) ?? tabs[0];

	const tabCount = tabs.length;
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const collapseBelow = tabCount * LABELLED_TAB_WIDTH;
		const ro = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const width = entry.contentRect.width;
			setCompact((prev) =>
				prev ? width < collapseBelow + LABEL_HYSTERESIS : width < collapseBelow,
			);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [tabCount]);

	return (
		<div
			ref={containerRef}
			className="isolate flex h-full w-full min-h-0 flex-col overflow-hidden bg-background"
		>
			<PRActionHeader workspaceId={workspaceId} />
			<SidebarHeader
				tabs={tabs}
				activeTab={activeTabDef?.id ?? activeTab}
				onTabChange={setActiveTab}
				compact={compact}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{activeTabDef?.content}
			</div>
		</div>
	);
}
