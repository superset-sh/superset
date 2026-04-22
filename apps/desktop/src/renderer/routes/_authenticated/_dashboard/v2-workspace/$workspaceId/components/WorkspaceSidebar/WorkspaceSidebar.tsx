import { Button } from "@superset/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LuFile, LuGitCompareArrows } from "react-icons/lu";
import { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { sidebarHeaderTabTriggerClassName } from "renderer/screens/main/components/WorkspaceView/RightSidebar/headerTabStyles";
import type { CommentPaneData } from "../../types";
import { FilesTab } from "./components/FilesTab";
import { SidebarHeader } from "./components/SidebarHeader";
import { useChangesTab } from "./hooks/useChangesTab";
import { useReviewTab } from "./hooks/useReviewTab";
import type { SidebarTabDefinition } from "./types";

export interface PendingReveal {
	path: string;
	isDirectory: boolean;
}

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onSelectDiffFile?: (path: string) => void;
	onOpenComment?: (comment: CommentPaneData) => void;
	onSearch?: () => void;
	selectedFilePath?: string;
	pendingReveal?: PendingReveal | null;
	workspaceId: string;
	workspaceName?: string;
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
	onSearch,
	selectedFilePath,
	pendingReveal,
	workspaceId,
	workspaceName,
}: WorkspaceSidebarProps) {
	const collections = useCollections();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const activeTab = localState?.sidebarState?.activeTab ?? "changes";
	const changesSubtab = localState?.sidebarState?.changesSubtab ?? "diffs";

	function setActiveTab(tab: string) {
		if (tab !== "changes" && tab !== "files") return;
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.activeTab = tab;
		});
	}

	function setChangesSubtab(subtab: "diffs" | "review") {
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.changesSubtab = subtab;
		});
	}

	const containerRef = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (entry) setCompact(entry.contentRect.width < 200);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const gitStatus = useGitStatus(workspaceId);

	const changesTab = useChangesTab({
		workspaceId,
		gitStatus,
		onSelectFile: onSelectDiffFile,
	});

	const reviewTab = useReviewTab({ workspaceId, onOpenComment });

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
				workspaceName={workspaceName}
				gitStatus={gitStatus.data}
			/>
		),
	};

	const combinedChangesTab: SidebarTabDefinition = {
		id: "changes",
		label: "Changes",
		icon: LuGitCompareArrows,
		badge: changesTab.badge,
		actions: changesSubtab === "diffs" ? changesTab.actions : reviewTab.actions,
		content: (
			<Tabs
				value={changesSubtab}
				onValueChange={(v) => setChangesSubtab(v as "diffs" | "review")}
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div className="h-8 shrink-0 border-b bg-background">
					<TabsList className="grid h-full w-full grid-cols-2 items-stretch gap-0 rounded-none bg-transparent p-0">
						<TabsTrigger
							value="diffs"
							className={cn(
								sidebarHeaderTabTriggerClassName,
								"min-w-0 w-full justify-center",
							)}
						>
							<span>Diffs</span>
							{changesTab.badge != null && (
								<span className="text-[11px] text-muted-foreground/60 tabular-nums">
									{changesTab.badge}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger
							value="review"
							className={cn(
								sidebarHeaderTabTriggerClassName,
								"min-w-0 w-full justify-center",
							)}
						>
							<span>Review</span>
							{reviewTab.badge != null && reviewTab.badge > 0 && (
								<span className="text-[11px] text-muted-foreground/60 tabular-nums">
									{reviewTab.badge}
								</span>
							)}
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent
					value="diffs"
					className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
				>
					{changesTab.content}
				</TabsContent>
				<TabsContent
					value="review"
					className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
				>
					{reviewTab.content}
				</TabsContent>
			</Tabs>
		),
	};

	const tabs = [combinedChangesTab, filesTab];
	const activeTabDef = tabs.find((t) => t.id === activeTab);

	return (
		<div
			ref={containerRef}
			className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background"
		>
			<SidebarHeader
				tabs={tabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				compact={compact}
			/>
			<div className="flex min-h-0 flex-1 flex-col">
				{activeTabDef?.content}
			</div>
		</div>
	);
}
