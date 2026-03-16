import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type { DashboardSidebarWorkspace } from "../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

interface DashboardSidebarCollapsedProjectContentProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	isCollapsed: boolean;
	isDragging: boolean;
	totalWorkspaceCount: number;
	workspaces: DashboardSidebarWorkspace[];
	workspaceIds: string[];
	allSections: Array<{ id: string; name: string }>;
	workspaceShortcutLabels: Map<string, string>;
	onToggleCollapse: () => void;
}

export function DashboardSidebarCollapsedProjectContent({
	projectId,
	projectName,
	githubOwner,
	isCollapsed,
	isDragging,
	totalWorkspaceCount,
	workspaces,
	workspaceIds,
	allSections,
	workspaceShortcutLabels,
	onToggleCollapse,
}: DashboardSidebarCollapsedProjectContentProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center py-2 border-b border-border last:border-b-0",
				isDragging && "opacity-30",
			)}
		>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onToggleCollapse}
						className={cn(
							"flex items-center justify-center size-8 rounded-md",
							"hover:bg-muted/50 transition-colors",
						)}
					>
						<ProjectThumbnail
							projectName={projectName}
							githubOwner={githubOwner}
						/>
					</button>
				</TooltipTrigger>
				<TooltipContent side="right" className="flex flex-col gap-0.5">
					<span className="font-medium">{projectName}</span>
					<span className="text-xs text-muted-foreground">
						{totalWorkspaceCount} workspace
						{totalWorkspaceCount !== 1 ? "s" : ""}
					</span>
				</TooltipContent>
			</Tooltip>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden w-full"
					>
						<div className="flex flex-col items-center gap-1 pt-1">
							{workspaces.map((workspace, index) => (
								<DashboardSidebarWorkspaceItem
									key={workspace.id}
									id={workspace.id}
									projectId={projectId}
									name={workspace.name}
									branch={workspace.branch}
									index={index}
									workspaceIds={workspaceIds}
									sections={allSections}
									shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
									isCollapsed
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
