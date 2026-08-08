import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import type { DashboardSidebarSessionsScope } from "../../hooks/useDashboardSidebarData/buildDashboardSidebarProjects";
import { DashboardSidebarNestedSection } from "../DashboardSidebarNestedSection";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface DashboardSidebarSessionsSectionProps {
	sessionsScope: DashboardSidebarSessionsScope;
	isCollapsed?: boolean;
	/** The workspaces-list collapse toggle hides rows; the header stays. */
	rowsHidden?: boolean;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

function collectScopeWorkspaces(scope: DashboardSidebarSessionsScope): Array<{
	workspace: DashboardSidebarSessionsScope["looseWorkspaces"][number];
	isInSection: boolean;
}> {
	const rows = scope.looseWorkspaces.map((workspace) => ({
		workspace,
		isInSection: false,
	}));
	const walk = (sections: DashboardSidebarSessionsScope["rootSections"]) => {
		for (const section of sections) {
			rows.push(
				...section.workspaces.map((workspace) => ({
					workspace,
					isInSection: true,
				})),
			);
			walk(section.childSections);
		}
	};
	walk(scope.rootSections);
	return rows;
}

/**
 * Top-level "Sessions" section, rendered above the Projects header: loose
 * sessions first, then the null-scope group tree. The header (and its "+",
 * which opens the create surface with "No project" preselected) always
 * renders in expanded mode — like the Projects header — so sessions stay
 * discoverable at zero. Collapsed rail renders a plain icon stack with a
 * trailing divider, matching the Pinned section.
 */
export function DashboardSidebarSessionsSection({
	sessionsScope,
	isCollapsed = false,
	rowsHidden = false,
	onWorkspaceHover,
}: DashboardSidebarSessionsSectionProps) {
	const openNewSessionModal = useOpenNewSessionModal();
	const { looseWorkspaces, rootSections } = sessionsScope;

	if (isCollapsed) {
		const rows = collectScopeWorkspaces(sessionsScope);
		if (rows.length === 0) return null;
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{rows.map(({ workspace, isInSection }) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						isInSection={isInSection}
						onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	return (
		<div className="pb-1">
			{/* Header styled to match the Projects header below it. */}
			<div className="flex min-h-8 w-full shrink-0 items-center gap-1.5 py-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
				<span className="min-w-0 truncate text-left">Sessions</span>
				<div className="min-w-0 flex-1" />
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="New session"
							onClick={openNewSessionModal}
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">New session</TooltipContent>
				</Tooltip>
			</div>
			{!rowsHidden &&
				looseWorkspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
					/>
				))}
			{!rowsHidden &&
				rootSections.map((section) => (
					<DashboardSidebarNestedSection
						key={section.id}
						section={section}
						depth={0}
						onWorkspaceHover={onWorkspaceHover}
					/>
				))}
		</div>
	);
}
