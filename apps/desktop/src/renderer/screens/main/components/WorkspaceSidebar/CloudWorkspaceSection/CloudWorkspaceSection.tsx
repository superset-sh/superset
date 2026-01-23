import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuChevronRight, LuCloud, LuPlus } from "react-icons/lu";
import { useCloudWorkspaces } from "renderer/react-query/cloud-workspaces";
import { STROKE_WIDTH } from "../constants";
import { CloudWorkspaceListItem } from "./CloudWorkspaceListItem";

interface CloudWorkspaceSectionProps {
	isCollapsed?: boolean;
	onNewWorkspace?: () => void;
	onConnectWorkspace?: (workspaceId: string) => void;
}

export function CloudWorkspaceSection({
	isCollapsed = false,
	onNewWorkspace,
	onConnectWorkspace,
}: CloudWorkspaceSectionProps) {
	const [isOpen, setIsOpen] = useState(true);
	const { cloudWorkspaces, isLoading } = useCloudWorkspaces();

	if (isCollapsed) {
		return (
			<div className="border-t border-border py-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<div className="flex justify-center">
							<Button
								variant="ghost"
								size="icon"
								className="size-8 text-muted-foreground hover:text-foreground"
								onClick={onNewWorkspace}
							>
								<LuCloud className="size-4" strokeWidth={STROKE_WIDTH} />
							</Button>
						</div>
					</TooltipTrigger>
					<TooltipContent side="right">Cloud Workspaces</TooltipContent>
				</Tooltip>

				{/* Show collapsed workspace indicators */}
				{cloudWorkspaces.map((workspace) => (
					<CloudWorkspaceListItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onConnect={onConnectWorkspace}
					/>
				))}
			</div>
		);
	}

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={setIsOpen}
			className="border-t border-border"
		>
			<div className="flex items-center gap-1 px-3 py-2">
				<CollapsibleTrigger asChild>
					<Button variant="ghost" size="icon" className="size-5">
						<LuChevronRight
							className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
							strokeWidth={STROKE_WIDTH}
						/>
					</Button>
				</CollapsibleTrigger>
				<span className="text-xs font-medium text-muted-foreground flex-1">
					Cloud Workspaces
				</span>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-5"
							onClick={onNewWorkspace}
						>
							<LuPlus className="size-3.5" strokeWidth={STROKE_WIDTH} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>New Cloud Workspace</TooltipContent>
				</Tooltip>
			</div>

			<CollapsibleContent>
				{isLoading ? (
					<div className="px-3 py-2 text-xs text-muted-foreground">
						Loading...
					</div>
				) : cloudWorkspaces.length === 0 ? (
					<div className="px-3 py-2 text-xs text-muted-foreground">
						No cloud workspaces
					</div>
				) : (
					<div className="pb-2">
						{cloudWorkspaces.map((workspace) => (
							<CloudWorkspaceListItem
								key={workspace.id}
								workspace={workspace}
								onConnect={onConnectWorkspace}
							/>
						))}
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
