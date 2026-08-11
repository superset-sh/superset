import { Button } from "@superset/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@superset/ui/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import {
	LuArchive,
	LuBot,
	LuGitPullRequest,
	LuLaptop,
	LuList,
	LuMonitor,
	LuSearch,
	LuSquareKanban,
	LuTerminal,
	LuX,
} from "react-icons/lu";
import type {
	V2WorkspaceHostOption,
	V2WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_THIS_DEVICE,
	PROJECT_FILTER_SESSIONS,
	useV2WorkspacesFilterStore,
	V2_WORKSPACES_AGENT_STATUS_FILTERS,
	V2_WORKSPACES_PR_STATE_FILTERS,
	type V2WorkspacesAgentStatusFilter,
	type V2WorkspacesArchivedWindow,
	type V2WorkspacesPrStateFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { V2WorkspaceProjectIcon } from "../V2WorkspaceProjectIcon";
import { DeviceFilterTriggerLabel } from "./components/DeviceFilterTriggerLabel";
import { DeviceOptionLabel } from "./components/DeviceOptionLabel";
import { MultiSelectFilter } from "./components/MultiSelectFilter";

const PR_STATE_LABELS: Record<V2WorkspacesPrStateFilter, string> = {
	open: "Open",
	draft: "Draft",
	queued: "Queued",
	merged: "Merged",
	closed: "Closed",
};

const AGENT_STATUS_LABELS: Record<V2WorkspacesAgentStatusFilter, string> = {
	idle: "Idle",
	working: "Working",
	permission: "Needs permission",
	review: "Ready for review",
	failed: "Failed",
};

const ARCHIVED_WINDOW_LABELS: Record<V2WorkspacesArchivedWindow, string> = {
	none: "Hide archived",
	week: "Archived: past week",
	month: "Archived: past month",
	all: "Archived: all",
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

export function V2WorkspacesHeader({
	hostOptions,
	projectOptions,
	hostsById,
}: V2WorkspacesHeaderProps) {
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
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);
	const setViewMode = useV2WorkspacesFilterStore((state) => state.setViewMode);
	const archivedWindow = useV2WorkspacesFilterStore(
		(state) => state.archivedWindow,
	);
	const setArchivedWindow = useV2WorkspacesFilterStore(
		(state) => state.setArchivedWindow,
	);

	const remoteHosts = hostOptions.filter((host) => !host.isLocal);
	const selectedRemoteHostFromOptions = remoteHosts.find(
		(host) => host.hostId === deviceFilter,
	);
	const selectedHostFallback =
		!selectedRemoteHostFromOptions && deviceFilter !== DEVICE_FILTER_THIS_DEVICE
			? hostsById.get(deviceFilter)
			: undefined;
	const selectedHostLabel = selectedRemoteHostFromOptions
		? {
				hostName: selectedRemoteHostFromOptions.hostName,
				isOnline: selectedRemoteHostFromOptions.isOnline,
			}
		: selectedHostFallback
			? {
					hostName: selectedHostFallback.hostName,
					isOnline: selectedHostFallback.isOnline,
				}
			: undefined;

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
			label: "Sessions",
			icon: <LuTerminal className="size-3.5" />,
		},
	];

	return (
		<div className="border-b border-border">
			<div className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4">
				<h1 className="text-sm font-semibold tracking-tight">Workspaces</h1>

				{/* Window-drag leaf standing in for the hidden TopBar. */}
				<div className="drag -my-4 min-w-0 flex-1 self-stretch" />

				<div className="flex flex-wrap items-center gap-2">
					<InputGroup className="w-64">
						<InputGroupAddon align="inline-start">
							<LuSearch className="size-4" />
						</InputGroupAddon>
						<InputGroupInput
							type="text"
							placeholder="Search workspaces…"
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
						/>
						{searchQuery ? (
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									size="icon-xs"
									aria-label="Clear search"
									onClick={() => setSearchQuery("")}
								>
									<LuX />
								</InputGroupButton>
							</InputGroupAddon>
						) : null}
					</InputGroup>

					<MultiSelectFilter
						placeholder="All projects"
						options={projectFilterOptions}
						value={projectFilters}
						onChange={setProjectFilters}
						searchable
					/>

					<MultiSelectFilter
						placeholder="PR state"
						icon={<LuGitPullRequest className="size-3.5" />}
						options={V2_WORKSPACES_PR_STATE_FILTERS.map((state) => ({
							value: state,
							label: PR_STATE_LABELS[state],
							icon: <PRIcon state={state} className="size-3.5" />,
						}))}
						value={prStateFilters}
						onChange={(next) =>
							setPrStateFilters(next as V2WorkspacesPrStateFilter[])
						}
					/>

					<MultiSelectFilter
						placeholder="Agent"
						icon={<LuBot className="size-3.5" />}
						options={V2_WORKSPACES_AGENT_STATUS_FILTERS.map((status) => ({
							value: status,
							label: AGENT_STATUS_LABELS[status],
						}))}
						value={agentStatusFilters}
						onChange={(next) =>
							setAgentStatusFilters(next as V2WorkspacesAgentStatusFilter[])
						}
					/>

					<Select value={deviceFilter} onValueChange={setDeviceFilter}>
						<SelectTrigger size="sm" className="min-w-[10rem]">
							<SelectValue placeholder="Filter devices">
								<DeviceFilterTriggerLabel
									deviceFilter={deviceFilter}
									selectedRemoteHost={selectedHostLabel}
								/>
							</SelectValue>
						</SelectTrigger>
						<SelectContent align="end" className="min-w-[16rem]">
							<SelectGroup>
								<SelectItem value={DEVICE_FILTER_THIS_DEVICE}>
									<DeviceOptionLabel
										icon={<LuLaptop className="size-3.5" />}
										label="This device"
									/>
								</SelectItem>
							</SelectGroup>

							{remoteHosts.length > 0 ? (
								<>
									<SelectSeparator />
									<SelectGroup>
										<SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
											Other devices
										</SelectLabel>
										{remoteHosts.map((host) => (
											<SelectItem key={host.hostId} value={host.hostId}>
												<DeviceOptionLabel
													icon={<LuMonitor className="size-3.5" />}
													label={host.hostName}
													isOnline={host.isOnline}
												/>
											</SelectItem>
										))}
									</SelectGroup>
								</>
							) : null}
						</SelectContent>
					</Select>

					{viewMode === "board" ? (
						<Select
							value={archivedWindow}
							onValueChange={(next) =>
								setArchivedWindow(next as V2WorkspacesArchivedWindow)
							}
						>
							<SelectTrigger size="sm" className="min-w-[10rem]">
								<SelectValue>
									<span className="flex items-center gap-1.5">
										<LuArchive className="size-3.5" />
										{ARCHIVED_WINDOW_LABELS[archivedWindow]}
									</span>
								</SelectValue>
							</SelectTrigger>
							<SelectContent align="end">
								{(
									Object.keys(
										ARCHIVED_WINDOW_LABELS,
									) as V2WorkspacesArchivedWindow[]
								).map((window) => (
									<SelectItem key={window} value={window}>
										{ARCHIVED_WINDOW_LABELS[window]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}

					<div className="flex items-center rounded-md border border-border p-0.5">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="List view"
							aria-pressed={viewMode === "list"}
							className={cn(
								"size-7",
								viewMode === "list" && "bg-accent text-accent-foreground",
							)}
							onClick={() => setViewMode("list")}
						>
							<LuList className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Board view"
							aria-pressed={viewMode === "board"}
							className={cn(
								"size-7",
								viewMode === "board" && "bg-accent text-accent-foreground",
							)}
							onClick={() => setViewMode("board")}
						>
							<LuSquareKanban className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
