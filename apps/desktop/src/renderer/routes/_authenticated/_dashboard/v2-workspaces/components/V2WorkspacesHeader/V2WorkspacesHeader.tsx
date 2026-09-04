import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	LuArchive,
	LuArrowDownUp,
	LuBot,
	LuFolder,
	LuGitPullRequest,
	LuLaptop,
	LuList,
	LuListFilter,
	LuMonitor,
	LuMonitorSmartphone,
	LuPanelLeft,
	LuSquareKanban,
	LuTerminal,
} from "react-icons/lu";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import { BoardColumnIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/BoardColumnIcon";
import type {
	V2WorkspaceHostOption,
	V2WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_ALL_DEVICES,
	DEVICE_FILTER_THIS_DEVICE,
	PROJECT_FILTER_SESSIONS,
	useV2WorkspacesFilterStore,
	V2_WORKSPACES_AGENT_STATUS_FILTERS,
	V2_WORKSPACES_AGENT_STATUS_LABELS,
	V2_WORKSPACES_BOARD_LANES,
	V2_WORKSPACES_PIN_FILTER_LABELS,
	V2_WORKSPACES_PIN_FILTERS,
	V2_WORKSPACES_PR_STATE_FILTERS,
	V2_WORKSPACES_SORT_LABELS,
	V2_WORKSPACES_SORT_MODES,
	type V2WorkspacesAgentStatusFilter,
	type V2WorkspacesArchivedWindow,
	type V2WorkspacesPinFilter,
	type V2WorkspacesPrStateFilter,
	type V2WorkspacesSortMode,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { BOARD_COLUMN_LABELS } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { V2WorkspaceProjectIcon } from "../V2WorkspaceProjectIcon";
import { DeviceOptionLabel } from "./components/DeviceOptionLabel";

const PR_STATE_LABELS: Record<V2WorkspacesPrStateFilter, MessageDescriptor> = {
	open: msg({ message: "Open", context: "status" }),
	draft: msg({
		message: "Draft",
	}),
	queued: msg({
		message: "Queued",
	}),
	merged: msg({
		message: "Merged",
	}),
	closed: msg({
		message: "Closed",
	}),
};

const ARCHIVED_WINDOW_LABELS: Record<
	V2WorkspacesArchivedWindow,
	MessageDescriptor
> = {
	none: msg({
		message: "Hidden",
	}),
	week: msg({
		message: "Past week",
	}),
	month: msg({
		message: "Past month",
	}),
	all: msg({ message: "All" }),
};

interface V2WorkspacesHeaderProps {
	hostOptions: V2WorkspaceHostOption[];
	projectOptions: V2WorkspaceProjectOption[];
	hostsById: Map<
		string,
		{ hostName: string; isOnline: boolean; isLocal: boolean }
	>;
	projectsById: Map<string, { projectName: string; iconUrl: string | null }>;
}

/** Muted right-aligned summary of a submenu's current selection. */
function SubmenuValue({ children }: { children: React.ReactNode }) {
	return (
		<span className="ml-auto max-w-[8rem] truncate pl-3 text-xs text-muted-foreground">
			{children}
		</span>
	);
}

export function V2WorkspacesHeader({
	hostOptions,
	projectOptions,
	hostsById,
}: V2WorkspacesHeaderProps) {
	const { t } = useLingui();
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const setSearchQuery = useV2WorkspacesFilterStore(
		(state) => state.setSearchQuery,
	);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const setDeviceFilter = useV2WorkspacesFilterStore(
		(state) => state.setDeviceFilter,
	);
	const projectFilters = useV2WorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const setProjectFilters = useV2WorkspacesFilterStore(
		(state) => state.setProjectFilters,
	);
	const prStateFilters = useV2WorkspacesFilterStore(
		(state) => state.prStateFilters,
	);
	const setPrStateFilters = useV2WorkspacesFilterStore(
		(state) => state.setPrStateFilters,
	);
	const agentStatusFilters = useV2WorkspacesFilterStore(
		(state) => state.agentStatusFilters,
	);
	const setAgentStatusFilters = useV2WorkspacesFilterStore(
		(state) => state.setAgentStatusFilters,
	);
	const pinFilter = useV2WorkspacesFilterStore((state) => state.pinFilter);
	const setPinFilter = useV2WorkspacesFilterStore(
		(state) => state.setPinFilter,
	);
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);
	const setViewMode = useV2WorkspacesFilterStore((state) => state.setViewMode);
	const sortMode = useV2WorkspacesFilterStore((state) => state.sortMode);
	const setSortMode = useV2WorkspacesFilterStore((state) => state.setSortMode);
	const archivedWindow = useV2WorkspacesFilterStore(
		(state) => state.archivedWindow,
	);
	const setArchivedWindow = useV2WorkspacesFilterStore(
		(state) => state.setArchivedWindow,
	);
	const hiddenLanes = useV2WorkspacesFilterStore((state) => state.hiddenLanes);
	const toggleLane = useV2WorkspacesFilterStore((state) => state.toggleLane);

	const remoteHosts = hostOptions.filter((host) => !host.isLocal);
	const deviceLabel =
		deviceFilter === DEVICE_FILTER_THIS_DEVICE
			? t({
					message: "This device",
				})
			: deviceFilter === DEVICE_FILTER_ALL_DEVICES
				? t({
						message: "All devices",
					})
				: (remoteHosts.find((host) => host.hostId === deviceFilter)?.hostName ??
					hostsById.get(deviceFilter)?.hostName ??
					t({
						message: "Unknown device",
					}));

	const projectFilterOptions = [
		...projectOptions.map((project) => ({
			value: project.projectId,
			label: project.projectName,
			icon: (
				<V2WorkspaceProjectIcon
					projectName={project.projectName}
					iconUrl={project.iconUrl}
					size="sm"
				/>
			),
		})),
		{
			value: PROJECT_FILTER_SESSIONS,
			label: t({
				message: "Sessions",
			}),
			icon: <LuTerminal className="size-3.5" />,
		},
	];

	const toggleIn = (values: string[], value: string) =>
		values.includes(value)
			? values.filter((entry) => entry !== value)
			: [...values, value];

	const activeFilterCount =
		(projectFilters.length > 0 ? 1 : 0) +
		(prStateFilters.length > 0 ? 1 : 0) +
		(agentStatusFilters.length > 0 ? 1 : 0) +
		(pinFilter !== "all" ? 1 : 0) +
		(deviceFilter !== DEVICE_FILTER_THIS_DEVICE ? 1 : 0);

	const clearFilters = () => {
		setProjectFilters([]);
		setPrStateFilters([]);
		setAgentStatusFilters([]);
		setPinFilter("all");
		setDeviceFilter(DEVICE_FILTER_THIS_DEVICE);
	};

	return (
		<div
			data-workspaces-toolbar
			className="@container shrink-0 border-b border-border px-4 py-2"
		>
			<div className="flex flex-col items-stretch gap-2 @4xl:flex-row @4xl:items-center @4xl:justify-between">
				<div className="flex min-w-0 items-center gap-3 overflow-x-auto hide-scrollbar">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn(
									"h-8 gap-1.5 font-normal",
									activeFilterCount === 0 && "text-muted-foreground",
								)}
							>
								<LuListFilter className="size-3.5" />
								<Trans>Filter</Trans>
								{activeFilterCount > 0 ? (
									<span className="flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground">
										{activeFilterCount}
									</span>
								) : null}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-[14rem]">
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuFolder className="size-3.5" />
										<Trans>Project</Trans>
									</span>
									{projectFilters.length > 0 ? (
										<SubmenuValue>{projectFilters.length}</SubmenuValue>
									) : null}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="max-h-[60vh] min-w-[12rem] overflow-y-auto">
									{projectFilterOptions.map((option) => (
										<DropdownMenuCheckboxItem
											key={option.value}
											checked={projectFilters.includes(option.value)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												setProjectFilters(
													toggleIn(projectFilters, option.value),
												)
											}
										>
											<span className="flex min-w-0 items-center gap-2">
												{option.icon}
												<span className="min-w-0 flex-1 truncate">
													{option.label}
												</span>
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>

							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuGitPullRequest className="size-3.5" />
										<Trans>PR state</Trans>
									</span>
									{prStateFilters.length > 0 ? (
										<SubmenuValue>
											{prStateFilters
												.map((state) => i18n._(PR_STATE_LABELS[state]))
												.join(", ")}
										</SubmenuValue>
									) : null}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-[10rem]">
									{V2_WORKSPACES_PR_STATE_FILTERS.map((state) => (
										<DropdownMenuCheckboxItem
											key={state}
											checked={prStateFilters.includes(state)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												setPrStateFilters(
													toggleIn(
														prStateFilters,
														state,
													) as V2WorkspacesPrStateFilter[],
												)
											}
										>
											<span className="flex items-center gap-2">
												<PRIcon state={state} className="size-3.5" />
												{i18n._(PR_STATE_LABELS[state])}
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>

							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuBot className="size-3.5" />
										<Trans>Agent</Trans>
									</span>
									{agentStatusFilters.length > 0 ? (
										<SubmenuValue>
											{agentStatusFilters
												.map((status) =>
													i18n._(V2_WORKSPACES_AGENT_STATUS_LABELS[status]),
												)
												.join(", ")}
										</SubmenuValue>
									) : null}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-[11rem]">
									{V2_WORKSPACES_AGENT_STATUS_FILTERS.map((status) => (
										<DropdownMenuCheckboxItem
											key={status}
											checked={agentStatusFilters.includes(status)}
											onSelect={(event) => event.preventDefault()}
											onCheckedChange={() =>
												setAgentStatusFilters(
													toggleIn(
														agentStatusFilters,
														status,
													) as V2WorkspacesAgentStatusFilter[],
												)
											}
										>
											{i18n._(V2_WORKSPACES_AGENT_STATUS_LABELS[status])}
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>

							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuPanelLeft className="size-3.5" />
										<Trans>Sidebar</Trans>
									</span>
									{pinFilter !== "all" ? (
										<SubmenuValue>
											{i18n._(V2_WORKSPACES_PIN_FILTER_LABELS[pinFilter])}
										</SubmenuValue>
									) : null}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-[10rem]">
									<DropdownMenuRadioGroup
										value={pinFilter}
										onValueChange={(next) =>
											setPinFilter(next as V2WorkspacesPinFilter)
										}
									>
										{V2_WORKSPACES_PIN_FILTERS.map((filter) => (
											<DropdownMenuRadioItem key={filter} value={filter}>
												{i18n._(V2_WORKSPACES_PIN_FILTER_LABELS[filter])}
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuSubContent>
							</DropdownMenuSub>

							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<span className="flex items-center gap-2">
										<LuMonitorSmartphone className="size-3.5" />
										<Trans>Device</Trans>
									</span>
									{deviceFilter !== DEVICE_FILTER_THIS_DEVICE ? (
										<SubmenuValue>{deviceLabel}</SubmenuValue>
									) : null}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="min-w-[14rem]">
									<DropdownMenuRadioGroup
										value={deviceFilter}
										onValueChange={setDeviceFilter}
									>
										<DropdownMenuRadioItem value={DEVICE_FILTER_ALL_DEVICES}>
											<DeviceOptionLabel
												icon={<LuMonitorSmartphone className="size-3.5" />}
												label={t({
													message: "All devices",
												})}
											/>
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value={DEVICE_FILTER_THIS_DEVICE}>
											<DeviceOptionLabel
												icon={<LuLaptop className="size-3.5" />}
												label={t({
													message: "This device",
												})}
											/>
										</DropdownMenuRadioItem>
										{remoteHosts.length > 0 ? (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
													<Trans>Other devices</Trans>
												</DropdownMenuLabel>
												{remoteHosts.map((host) => (
													<DropdownMenuRadioItem
														key={host.hostId}
														value={host.hostId}
													>
														<DeviceOptionLabel
															icon={<LuMonitor className="size-3.5" />}
															label={host.hostName}
															isOnline={host.isOnline}
														/>
													</DropdownMenuRadioItem>
												))}
											</>
										) : null}
									</DropdownMenuRadioGroup>
								</DropdownMenuSubContent>
							</DropdownMenuSub>

							{activeFilterCount > 0 ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="justify-center text-xs text-muted-foreground"
										onSelect={clearFilters}
									>
										<Trans>Clear filters</Trans>
									</DropdownMenuItem>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>

					<div className="h-4 w-px shrink-0 bg-border" />

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 font-normal text-muted-foreground"
							>
								<LuArrowDownUp className="size-3.5" />
								<Trans>Display</Trans>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-[12rem]">
							<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Trans>Sort by</Trans>
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={sortMode}
								onValueChange={(next) =>
									setSortMode(next as V2WorkspacesSortMode)
								}
							>
								{V2_WORKSPACES_SORT_MODES.map((mode) => (
									<DropdownMenuRadioItem key={mode} value={mode}>
										{i18n._(V2_WORKSPACES_SORT_LABELS[mode])}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<span className="flex items-center gap-1.5">
									<LuArchive className="size-3" />
									<Trans>Archived</Trans>
								</span>
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={archivedWindow}
								onValueChange={(next) =>
									setArchivedWindow(next as V2WorkspacesArchivedWindow)
								}
							>
								{(
									Object.keys(
										ARCHIVED_WINDOW_LABELS,
									) as V2WorkspacesArchivedWindow[]
								).map((window) => (
									<DropdownMenuRadioItem key={window} value={window}>
										{i18n._(ARCHIVED_WINDOW_LABELS[window])}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
							{viewMode === "board" && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
										<Trans>Lanes</Trans>
									</DropdownMenuLabel>
									{V2_WORKSPACES_BOARD_LANES.map((lane) => (
										<DropdownMenuCheckboxItem
											key={lane}
											checked={!hiddenLanes.includes(lane)}
											onCheckedChange={() => toggleLane(lane)}
											onSelect={(event) => event.preventDefault()}
										>
											<span className="flex items-center gap-1.5">
												<BoardColumnIcon column={lane} className="size-3" />
												{i18n._(BOARD_COLUMN_LABELS[lane])}
											</span>
										</DropdownMenuCheckboxItem>
									))}
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{/* Window-drag leaf standing in for the hidden TopBar. */}
				<div className="drag hidden min-w-0 flex-1 self-stretch @4xl:block" />

				<div className="flex shrink-0 items-center gap-2">
					<fieldset
						className="flex items-center rounded-md border bg-muted/30 p-0.5"
						aria-label={t({
							message: "Workspace layout",
						})}
					>
						<button
							type="button"
							aria-pressed={viewMode === "list"}
							className={cn(
								"flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors",
								viewMode === "list"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setViewMode("list")}
						>
							<LuList className="size-3.5" />
							<Trans>List</Trans>
						</button>
						<button
							type="button"
							aria-pressed={viewMode === "board"}
							className={cn(
								"flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors",
								viewMode === "board"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setViewMode("board")}
						>
							<LuSquareKanban className="size-3.5" />
							<Trans>Board</Trans>
						</button>
					</fieldset>

					<WorkItemsSearch
						value={searchQuery}
						onChange={setSearchQuery}
						placeholder={t({
							message: "Search workspaces…",
						})}
						label={t({
							message: "Search workspaces",
						})}
					/>
				</div>
			</div>
		</div>
	);
}
