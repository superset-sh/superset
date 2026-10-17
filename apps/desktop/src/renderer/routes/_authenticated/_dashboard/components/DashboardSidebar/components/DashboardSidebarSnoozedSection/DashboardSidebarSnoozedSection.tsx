import { useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import type { DashboardSidebarSnoozedWorkspace } from "../../types";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { useSnoozedWorkspaceWaker } from "./hooks/useSnoozedWorkspaceWaker";

interface DashboardSidebarSnoozedSectionProps {
	snoozedWorkspaces: DashboardSidebarSnoozedWorkspace[];
	isCollapsed?: boolean;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

function formatWakeTime(until: number): string {
	const isToday = new Date(until).toDateString() === new Date().toDateString();
	return formatDateTime(
		until,
		isToday
			? { hour: "numeric", minute: "2-digit" }
			: { weekday: "short", hour: "numeric", minute: "2-digit" },
	);
}

export function DashboardSidebarSnoozedSection({
	snoozedWorkspaces,
	isCollapsed = false,
	onWorkspaceHover,
}: DashboardSidebarSnoozedSectionProps) {
	const { t } = useLingui();
	useSnoozedWorkspaceWaker(snoozedWorkspaces);
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.snoozed,
	);

	if (isCollapsed || snoozedWorkspaces.length === 0) return null;

	const count = snoozedWorkspaces.length;
	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: `Snoozed (${count})` })}
				section="snoozed"
			/>
			{!isSectionCollapsed &&
				snoozedWorkspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						indentation="top-level"
						pinnedContext={{
							projectName: workspace.projectName,
							projectIconUrl: workspace.projectIconUrl,
						}}
						snoozedUntil={workspace.snoozedUntil}
						shortcutLabel={formatWakeTime(workspace.snoozedUntil)}
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
		</div>
	);
}
