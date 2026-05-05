import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LuFile, LuGitCompareArrows } from "react-icons/lu";
import { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { CommentPaneData } from "../../types";
import { FilesTab } from "./components/FilesTab";
import { PRActionHeader } from "./components/PRActionHeader";
import { SidebarHeader } from "./components/SidebarHeader";
import { useChangesTab } from "./hooks/useChangesTab";
import { type OpenChatFn, usePRFlowDispatch } from "./hooks/usePRFlowDispatch";
import { usePRFlowState } from "./hooks/usePRFlowState";
import { useReviewTab } from "./hooks/useReviewTab";
import type { SidebarTabDefinition } from "./types";

// Gates the "Create PR" button only — the chat-driven create flow doesn't
// exist in v2 yet. The PR status group (link + merge dropdown for an open PR)
// always renders so users can see PR state and merge once a PR exists.
const CREATE_PR_BUTTON_ENABLED = false;

type SidebarTabId = "changes" | "files" | "review";

const VALID_TAB_IDS: readonly SidebarTabId[] = ["changes", "files", "review"];

function isSidebarTabId(tab: string): tab is SidebarTabId {
	return (VALID_TAB_IDS as readonly string[]).includes(tab);
}

export interface PendingReveal {
	path: string;
	isDirectory: boolean;
}

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onSelectDiffFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenComment?: (comment: CommentPaneData) => void;
	onOpenChat?: OpenChatFn;
	onSearch?: () => void;
	selectedFilePath?: string;
	pendingReveal?: PendingReveal | null;
	workspaceId: string;
}

function IconButton({
	icon: Icon,
	tooltip,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>;
	tooltip: string;
	onClick?: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClick}
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

export function WorkspaceSidebar({
	onSelectFile,
	onSelectDiffFile,
	onOpenComment,
	onOpenChat,
	onSearch,
	selectedFilePath,
	pendingReveal,
	workspaceId,
}: WorkspaceSidebarProps) {
	const collections = useCollections();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const activeTab: SidebarTabId =
		(localState?.sidebarState?.activeTab as SidebarTabId | undefined) ??
		"changes";

	function setActiveTab(tab: string) {
		if (!isSidebarTabId(tab)) return;
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.activeTab = tab;
		});
	}

	const containerRef = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const width = entry.contentRect.width;
			// Hysteresis: expand back to labels only once we're clearly past
			// the breakpoint, so the labels don't jitter on the edge.
			setCompact((prev) => (prev ? width < 280 : width < 260));
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const gitStatus = useGitStatus(workspaceId);

	const changesTabDef = useChangesTab({
		workspaceId,
		gitStatus,
		onSelectFile: onSelectDiffFile,
		onOpenFile: onSelectFile,
	});
	const changesTab: SidebarTabDefinition = {
		...changesTabDef,
		icon: LuGitCompareArrows,
	};

	const reviewTab = useReviewTab({ workspaceId, onOpenComment });

	const { flowState, onRetry } = usePRFlowState(workspaceId);
	const dispatch = usePRFlowDispatch({
		onOpenChat: onOpenChat ?? (() => {}),
	});

	const filesTab: SidebarTabDefinition = {
		id: "files",
		label: "Files",
		icon: LuFile,
		actions: <IconButton icon={Search} tooltip="Search" onClick={onSearch} />,
		content: (
			<FilesTab
				onSelectFile={onSelectFile}
				selectedFilePath={selectedFilePath}
				pendingReveal={pendingReveal}
				workspaceId={workspaceId}
				gitStatus={gitStatus.data}
			/>
		),
	};

	const tabs: SidebarTabDefinition[] = [filesTab, changesTab, reviewTab];
	const activeTabDef = tabs.find((t) => t.id === activeTab);

	return (
		<div
			ref={containerRef}
			className="isolate flex h-full w-full min-h-0 flex-col overflow-hidden bg-background"
		>
			<PRActionHeader
				workspaceId={workspaceId}
				state={flowState}
				dispatch={dispatch}
				onRetry={onRetry}
				createPREnabled={CREATE_PR_BUTTON_ENABLED}
			/>
			<SidebarHeader
				tabs={tabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				compact={compact}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{activeTabDef?.content}
			</div>
		</div>
	);
}
