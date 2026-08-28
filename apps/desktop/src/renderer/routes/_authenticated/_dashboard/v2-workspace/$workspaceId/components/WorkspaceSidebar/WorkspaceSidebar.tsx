import { useLingui } from "@lingui/react/macro";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef, useState } from "react";
import { LuFile, LuGitCompareArrows } from "react-icons/lu";
import { getChangesetFileKey } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useWorkspaceGitStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	WORKSPACE_SIDEBAR_TABS,
	type WorkspaceSidebarTab,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useSettings } from "renderer/stores/settings";
import type { CommentPaneData, DiffFocusSide } from "../../types";
import { FilesTab } from "./components/FilesTab";
import { PRActionHeader } from "./components/PRActionHeader";
import { SidebarHeader } from "./components/SidebarHeader";
import { useChangesTab } from "./hooks/useChangesTab";
import { usePRFlowState } from "./hooks/usePRFlowState";
import { useReviewTab } from "./hooks/useReviewTab";
import type { SidebarTabDefinition } from "./types";

// Gates the "Create PR" button only — the chat-driven create flow doesn't
// exist in v2 yet. The PR status group (link + merge dropdown for an open PR)
// always renders so users can see PR state and merge once a PR exists.

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
	pendingReveal?: PendingReveal | null;
	workspaceId: string;
}

export function WorkspaceSidebar({
	onSelectFile,
	onSelectDiffFile,
	onOpenComment,
	onSearch,
	selectedFilePath,
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
	const activeTab: SidebarTabId =
		localState && isSidebarTabId(localState.sidebarState.activeTab)
			? localState.sidebarState.activeTab
			: "changes";

	function setActiveTab(tab: string) {
		if (!isSidebarTabId(tab)) return;
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.activeTab = tab;
		});
	}

	const containerRef = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);

	const changesTabDef = useChangesTab({
		workspaceId,
		selectedFilePath,
		onSelectFile: onSelectDiffFile
			? (path, openInNewTab, changeKey) =>
					onSelectDiffFile(path, openInNewTab, undefined, undefined, changeKey)
			: undefined,
		onOpenFile: onSelectFile,
	});
	const changesTab: SidebarTabDefinition = {
		...changesTabDef,
		icon: LuGitCompareArrows,
	};

	// PR review comments are always relative to the base branch, so they map
	// onto the "against-base" source group — matching the same query (and
	// changeKey format) the Changes tab uses for that group lets us disambiguate
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

	const { flowState, onRetry } = usePRFlowState(workspaceId);
	const filesTab: SidebarTabDefinition = {
		id: "files",
		label: t({ id: "workspace.sidebar.filesTab", message: "Files" }),
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
			<PRActionHeader
				workspaceId={workspaceId}
				state={flowState}
				onRetry={onRetry}
			/>
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
