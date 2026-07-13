import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import type { DashboardSidebarProject, SidebarStatusBucket } from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { STATUS_BUCKET_META } from "./statusBucketMeta";

interface DashboardSidebarStatusSectionProps {
	project: DashboardSidebarProject;
	isSidebarCollapsed?: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Renders one synthetic status bucket (Working / Open PR / Done / Idle).
 *
 * Deliberately NOT `DashboardSidebarProjectSection`: a status bucket has no real
 * project, so it has no context menu / rename / section actions, no DnD, and
 * owns its own collapse state (the `status:*` id isn't a real project the
 * persisted-collapse mutations understand). Workspace rows are reused verbatim
 * so an individual row looks and behaves identically to project mode.
 */
export function DashboardSidebarStatusSection({
	project,
	isSidebarCollapsed = false,
	workspaceShortcutLabels,
	onWorkspaceHover,
}: DashboardSidebarStatusSectionProps) {
	const bucket: SidebarStatusBucket = project.statusBucket ?? "idle";
	const meta = STATUS_BUCKET_META[bucket];
	const workspaces = useMemo(
		() => getProjectChildrenWorkspaces(project.children),
		[project.children],
	);
	const [isCollapsed, setIsCollapsed] = useState(false);

	if (workspaces.length === 0) return null;

	if (isSidebarCollapsed) {
		return (
			<div className="flex flex-col items-center gap-1 border-b border-border py-1 last:border-b-0">
				<div
					className={cn("size-2 rounded-full", meta.dotClassName)}
					title={`${meta.label} (${workspaces.length})`}
				/>
				{workspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
						shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={() => setIsCollapsed((value) => !value)}
				className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
				aria-expanded={!isCollapsed}
			>
				<HiChevronRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						!isCollapsed && "rotate-90",
					)}
				/>
				<span
					className={cn("size-2 shrink-0 rounded-full", meta.dotClassName)}
				/>
				<span className="text-sm font-medium text-foreground">
					{meta.label}
				</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{workspaces.length}
				</span>
				<span className="ml-auto truncate text-[10px] uppercase tracking-wide text-muted-foreground/60">
					{meta.sublabel}
				</span>
			</button>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pb-1">
							{workspaces.map((workspace) => (
								<div
									key={workspace.id}
									style={{ borderLeft: `2px solid ${meta.accentColor}` }}
								>
									<DashboardSidebarWorkspaceItem
										workspace={workspace}
										onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
										shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
									/>
								</div>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
