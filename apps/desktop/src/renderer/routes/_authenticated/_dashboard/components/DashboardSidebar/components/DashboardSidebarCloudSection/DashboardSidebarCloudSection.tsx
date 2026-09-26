import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewWorkspaceForHost } from "renderer/hooks/useOpenNewWorkspace";
import { CLOUD_HOST_ID } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/DevicePicker";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

/**
 * Cloud workspaces, above the projects.
 *
 * They sit in their own section rather than under a project because the row a
 * sandbox serves carries the sandbox's own project id — there is no cloud
 * project to group under.
 *
 * The cloud row owns the workspace's identity — it is what created, named and
 * lists it. The row inside the sandbox exists only so host-service has
 * something to serve panes against, so its name is ignored here. Only the
 * open workspace's sandbox is in the fan-out, so every other row shows the
 * branch it was created on; pull requests come from the cloud table.
 */
export function DashboardSidebarCloudSection({
	rows,
	cloudFlag,
	isCloudEnabled,
	isCollapsed,
	onWorkspaceHover,
}: {
	rows: DashboardSidebarWorkspace[];
	cloudFlag: boolean | undefined;
	isCloudEnabled: boolean;
	isCollapsed?: boolean;
	onWorkspaceHover?: (workspaceId: string) => void | Promise<void>;
}) {
	const { t } = useLingui();
	const openNewWorkspaceForHost = useOpenNewWorkspaceForHost();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.cloud,
	);

	// A definite no takes the rows with it. The list query is gated on the same
	// flag, but react-query keeps what it already fetched when a query is
	// disabled, so a flag that flips off mid-session would otherwise leave the
	// section it gates on screen.
	if (cloudFlag === false) return null;
	// The header carries the only way to create a cloud workspace, so it stays
	// at zero rows like the Sessions header does — a user with no cloud
	// workspaces is exactly who needs the "+". Only on a definite yes, so
	// unresolved flags don't leave an empty Cloud section behind; the
	// collapsed rail has no headers, so there it is still rows or nothing.
	if (rows.length === 0 && (isCollapsed || !isCloudEnabled)) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{rows.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Cloud" })}
				section="cloud"
			>
				{isCloudEnabled && (
					<Tooltip delayDuration={700}>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "New cloud workspace" })}
								onClick={(event) => {
									event.stopPropagation();
									openNewWorkspaceForHost(CLOUD_HOST_ID);
								}}
								onKeyDown={(event) => event.stopPropagation()}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<LuPlus className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>New cloud workspace</Trans>
						</TooltipContent>
					</Tooltip>
				)}
			</DashboardSidebarSectionHeader>
			{!isSectionCollapsed &&
				rows.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						indentation="top-level"
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
		</div>
	);
}
