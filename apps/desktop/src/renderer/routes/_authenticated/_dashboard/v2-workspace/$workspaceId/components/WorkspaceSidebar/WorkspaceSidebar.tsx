import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { FilesTab } from "./components/FilesTab";
import { SidebarHeader } from "./components/SidebarHeader";

type SidebarTab = "files" | "changes" | "checks";

interface WorkspaceSidebarProps {
	onSelectFile: (absolutePath: string) => void;
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
	onSearch,
	selectedFilePath,
	workspaceId,
	workspaceName,
}: WorkspaceSidebarProps) {
	const [activeTab, setActiveTab] = useState<SidebarTab>("files");

	const tabActions: Record<SidebarTab, ReactNode> = {
		files: <IconButton icon={Search} tooltip="Search" onClick={onSearch} />,
		changes: null,
		checks: null,
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background">
			<SidebarHeader
				tabs={[
					{ id: "files", label: "All files" },
					{ id: "changes", label: "Changes" },
					{ id: "checks", label: "Checks" },
				]}
				activeTab={activeTab}
				onTabChange={(id) => setActiveTab(id as SidebarTab)}
				actions={tabActions[activeTab]}
			/>

			<div className={activeTab === "files" ? "min-h-0 flex-1" : "hidden"}>
				<FilesTab
					onSelectFile={onSelectFile}
					selectedFilePath={selectedFilePath}
					workspaceId={workspaceId}
					workspaceName={workspaceName}
				/>
			</div>
			<div className={activeTab === "changes" ? "min-h-0 flex-1" : "hidden"}>
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					Coming soon
				</div>
			</div>
			<div className={activeTab === "checks" ? "min-h-0 flex-1" : "hidden"}>
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					Coming soon
				</div>
			</div>
		</div>
	);
}
