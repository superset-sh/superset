import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import { LuClock, LuLayers, LuPlus } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import {
	tasksSearchFromFilters,
	useTasksFilterStore,
} from "renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

/**
 * The real sidebar's nav block (org switcher, Workspaces, Automations,
 * Tasks & PRs, New Workspace), copied from DashboardSidebarHeader so the
 * prototype reads as the actual app. These are LIVE imports — the prototype
 * runs inside the authenticated shell, so the org dropdown shows the real
 * org and every button really navigates (Dev ▸ Open Attention Prototype
 * brings you back). Omitted vs the real header: the traffic-light row (the
 * prototype has its own) and Add repository (moved onto the Projects panel).
 */
export function PrototypeSidebarHeader() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const openModal = useOpenNewWorkspaceModal();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	const { gateFeature } = usePaywall();
	const isWorkspacesListOpen = !!matchRoute({ to: "/v2-workspaces" });
	const isTasksOpen = !!matchRoute({ to: "/tasks", fuzzy: true });
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });
	const { myFailedCount } = useFailedAutomations();

	const {
		tab: lastTab,
		assignee: lastAssignee,
		search: lastSearch,
		typeTab: lastTypeTab,
		projectFilter: lastProjectFilter,
		linearProjectFilter: lastLinearProjectFilter,
	} = useTasksFilterStore();

	const handleTasksClick = () => {
		gateFeature(GATED_FEATURES.TASKS, () => {
			navigate({
				to: "/tasks",
				search: tasksSearchFromFilters({
					tab: lastTab,
					assignee: lastAssignee,
					search: lastSearch,
					typeTab: lastTypeTab,
					projectFilter: lastProjectFilter,
					linearProjectFilter: lastLinearProjectFilter,
				}),
			});
		});
	};

	return (
		<div className="flex flex-col gap-1 border-border border-b px-3 pb-2">
			<OrganizationDropdown variant="expanded" />

			<button
				type="button"
				onClick={() => navigate({ to: "/v2-workspaces" })}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm transition-colors",
					isWorkspacesListOpen
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
			>
				<LuLayers className="size-4 shrink-0" />
				<span className="flex-1 text-left">Workspaces</span>
			</button>

			<button
				type="button"
				onClick={() => navigate({ to: "/automations" })}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm transition-colors",
					isAutomationsOpen
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
			>
				<LuClock className="size-4 shrink-0" />
				<span className="flex-1 text-left">Automations</span>
				{myFailedCount > 0 && (
					<span
						title={`${myFailedCount} of your automations failed their last run`}
						className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500/15 px-1 font-medium text-[10px] text-red-600 tabular-nums dark:text-red-400"
					>
						{myFailedCount > 9 ? "9+" : myFailedCount}
					</span>
				)}
			</button>

			<button
				type="button"
				onClick={handleTasksClick}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm transition-colors",
					isTasksOpen
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
			>
				<HiOutlineClipboardDocumentList className="size-4 shrink-0" />
				<span className="flex-1 text-left">Tasks & PRs</span>
			</button>

			<button
				type="button"
				onClick={() => openModal()}
				className="group flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:bg-accent/50 hover:text-foreground"
			>
				<LuPlus className="size-4 shrink-0" strokeWidth={STROKE_WIDTH_THICK} />
				<span className="flex-1 truncate whitespace-nowrap text-left">
					New Workspace
				</span>
				<span
					className={cn(
						"shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums",
						"opacity-0 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100",
					)}
				>
					{shortcutText}
				</span>
			</button>
		</div>
	);
}
