import { DndContext } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { type ComponentPropsWithoutRef, forwardRef, useMemo } from "react";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useSidebarDnd } from "../../../../hooks/useSidebarDnd";
import { parseId } from "../../../../hooks/useSidebarDnd/useSidebarDnd";
import type { DashboardSidebarProjectChild } from "../../../../types";
import { SortableCollapsedWorkspaceItem } from "./components/SortableCollapsedWorkspaceItem";

interface DashboardSidebarCollapsedProjectContentProps
	extends ComponentPropsWithoutRef<"div"> {
	projectId: string;
	projectName: string;
	iconUrl: string | null;
	isCollapsed: boolean;
	totalWorkspaceCount: number;
	projectChildren: DashboardSidebarProjectChild[];
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onToggleCollapse: () => void;
}

export const DashboardSidebarCollapsedProjectContent = forwardRef<
	HTMLDivElement,
	DashboardSidebarCollapsedProjectContentProps
>(
	(
		{
			projectId,
			projectName,
			iconUrl,
			isCollapsed,
			totalWorkspaceCount,
			projectChildren,
			workspaceShortcutLabels,
			onWorkspaceHover,
			onToggleCollapse,
			className,
			...props
		},
		ref,
	) => {
		const {
			sensors,
			measuring,
			collisionDetection,
			flatItems,
			workspacesById,
			handlers,
		} = useSidebarDnd({ projectId, projectChildren });

		// Sections aren't rendered in the collapsed rail — only workspace icons
		// are sortable; useSidebarDnd still persists cross-section moves.
		const workspaceItems = useMemo(
			() => flatItems.filter((id) => parseId(id)?.type === "workspace"),
			[flatItems],
		);

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
							onClick={onToggleCollapse}
							className={cn(
								"flex items-center justify-center size-8 rounded-md",
								"hover:bg-muted/50 transition-colors",
							)}
						>
							<ProjectThumbnail projectName={projectName} iconUrl={iconUrl} />
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
							<div className="flex w-full flex-col pt-1">
								<DndContext
									sensors={sensors}
									collisionDetection={collisionDetection}
									measuring={measuring}
									{...handlers}
								>
									<SortableContext
										items={workspaceItems}
										strategy={verticalListSortingStrategy}
									>
										{workspaceItems.map((id) => {
											const parsed = parseId(id);
											if (!parsed) return null;
											const workspace = workspacesById.get(parsed.realId);
											if (!workspace) return null;
											return (
												<SortableCollapsedWorkspaceItem
													key={String(id)}
													sortableId={String(id)}
													workspace={workspace}
													onHoverCardOpen={() =>
														onWorkspaceHover(parsed.realId)
													}
													shortcutLabel={workspaceShortcutLabels.get(
														parsed.realId,
													)}
													disabled={
														workspace.type === "main" &&
														workspace.hostType === "local-device"
													}
												/>
											);
										})}
									</SortableContext>
								</DndContext>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	},
);
