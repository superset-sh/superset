import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import type { CommentPaneData } from "../../types";
import { FilesTab } from "./components/FilesTab";
import { SidebarHeader } from "./components/SidebarHeader";
import { useChangesTab } from "./hooks/useChangesTab";
import { useReviewTab } from "./hooks/useReviewTab";
import type { SidebarTabDefinition } from "./types";

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onSelectDiffFile?: (path: string) => void;
	onOpenComment?: (comment: CommentPaneData) => void;
	onSearch?: () => void;
	selectedFilePath?: string;
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
	workspaceId,
	workspaceName,
}: WorkspaceSidebarProps) {
	const [activeTab, setActiveTab] = useState("files");

	const gitStatus = useGitStatus(workspaceId);

	const changesTab = useChangesTab({
		workspaceId,
		gitStatus,
		onSelectFile: onSelectDiffFile,
	});

	const reviewTab = useReviewTab({ workspaceId, onOpenComment });

	const filesTab: SidebarTabDefinition = useMemo(
		() => ({
			id: "files",
			label: "All files",
			actions: <IconButton icon={Search} tooltip="Search" onClick={onSearch} />,
			content: (
				<FilesTab
					onSelectFile={onSelectFile}
					selectedFilePath={selectedFilePath}
					workspaceId={workspaceId}
					workspaceName={workspaceName}
					gitStatus={gitStatus.data}
				/>
			),
		}),
		[
			gitStatus.data,
			onSearch,
			onSelectFile,
			selectedFilePath,
			workspaceId,
			workspaceName,
		],
	);

	const tabs = [filesTab, changesTab, reviewTab];
	const activeTabDef = tabs.find((t) => t.id === activeTab);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background">
			<SidebarHeader
				tabs={tabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
			/>
			<div className="min-h-0 flex-1">{activeTabDef?.content}</div>
		</div>
	);
}
