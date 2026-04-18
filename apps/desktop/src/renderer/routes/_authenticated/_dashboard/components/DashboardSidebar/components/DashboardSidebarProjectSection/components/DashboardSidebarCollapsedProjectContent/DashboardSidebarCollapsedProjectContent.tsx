import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type {
	DashboardSidebarProjectBackingState,
	DashboardSidebarWorkspace,
} from "../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";
import { ProjectBackingStateIndicator } from "../ProjectBackingStateIndicator";

interface DashboardSidebarCollapsedProjectContentProps
	extends ComponentPropsWithoutRef<"div"> {
	projectName: string;
	githubOwner: string | null;
	backingState: DashboardSidebarProjectBackingState;
	isCollapsed: boolean;
	totalWorkspaceCount: number;
	workspaces: DashboardSidebarWorkspace[];
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: () => void;
	onSetUpHere: () => void;
}

export const DashboardSidebarCollapsedProjectContent = forwardRef<
	HTMLDivElement,
	DashboardSidebarCollapsedProjectContentProps
>(
	(
		{
			projectName,
			githubOwner,
			backingState,
			isCollapsed,
			totalWorkspaceCount,
			workspaces,
			workspaceShortcutLabels,
			onWorkspaceHover,
			onToggleCollapse,
			onSetUpHere,
			className,
			...props
		},
		ref,
	) => {
		return (
			<div
				ref={ref}
				className={cn(
					"flex flex-col items-center py-2 border-b border-border last:border-b-0",
					className,
				)}
				{...props}
			>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={
								backingState === "not-set-up-here"
									? onSetUpHere
									: onToggleCollapse
							}
							className={cn(
								"relative flex items-center justify-center size-8 rounded-md",
								"hover:bg-muted/50 transition-colors",
							)}
						>
							<ProjectThumbnail
								projectName={projectName}
								githubOwner={githubOwner}
							/>
							{backingState !== "normal" && (
								<ProjectBackingStateIndicator
									state={backingState}
									variant="dot-only"
									className="absolute -top-0.5 -right-0.5"
								/>
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="right" className="flex flex-col gap-0.5">
						<span className="font-medium">{projectName}</span>
						{backingState === "not-set-up-here" ? (
							<span className="text-xs text-amber-500">
								Not set up — click to set up here
							</span>
						) : (
							<span className="text-xs text-muted-foreground">
								{totalWorkspaceCount} workspace
								{totalWorkspaceCount !== 1 ? "s" : ""}
							</span>
						)}
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
							<div className="flex w-full flex-col pt-1">
								{workspaces.map((workspace) => (
									<DashboardSidebarWorkspaceItem
										key={workspace.id}
										workspace={workspace}
										onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
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
	},
);
