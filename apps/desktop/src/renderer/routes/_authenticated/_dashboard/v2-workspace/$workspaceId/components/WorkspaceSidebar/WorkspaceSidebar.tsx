import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FilesTab } from "./components/FilesTab";
import { SidebarHeader } from "./components/SidebarHeader";
import { useChangesTab } from "./hooks/useChangesTab";
import type { SidebarTabDefinition } from "./types";

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string) => void;
	onSelectDiffFile?: (
		path: string,
		category: "against-base" | "staged" | "unstaged",
	) => void;
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
	onSearch,
	selectedFilePath,
	workspaceId,
	workspaceName,
}: WorkspaceSidebarProps) {
	const [activeTab, setActiveTab] = useState("files");

	const changesTab = useChangesTab({
		workspaceId,
		onSelectFile: onSelectDiffFile,
	});

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
				/>
			),
		}),
		[onSearch, onSelectFile, selectedFilePath, workspaceId, workspaceName],
	);

	const checksTab: SidebarTabDefinition = useMemo(
		() => ({
			id: "checks",
			label: "Checks",
			content: (
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					Coming soon
				</div>
			),
		}),
		[],
	);

	const tabs = [filesTab, changesTab, checksTab];
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
