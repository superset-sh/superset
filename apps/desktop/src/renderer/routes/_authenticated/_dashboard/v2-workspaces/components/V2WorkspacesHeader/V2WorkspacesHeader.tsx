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
	LuFolders,
	LuLaptop,
	LuLayers,
	LuMonitor,
	LuSearch,
	LuX,
} from "react-icons/lu";
import type {
	V2WorkspaceDeviceCounts,
	V2WorkspaceHostOption,
	V2WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_ALL,
	DEVICE_FILTER_THIS_DEVICE,
	PROJECT_FILTER_ALL,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { V2WorkspaceProjectIcon } from "../V2WorkspaceProjectIcon";

interface V2WorkspacesHeaderProps {
	counts: V2WorkspaceDeviceCounts;
	hostOptions: V2WorkspaceHostOption[];
	projectOptions: V2WorkspaceProjectOption[];
}

export function V2WorkspacesHeader({
	counts,
	hostOptions,
	projectOptions,
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
	const projectFilter = useV2WorkspacesFilterStore(
		(state) => state.projectFilter,
	);
	const setProjectFilter = useV2WorkspacesFilterStore(
		(state) => state.setProjectFilter,
	);

	const remoteHosts = hostOptions.filter((host) => !host.isLocal);
	const selectedRemoteHost = remoteHosts.find(
		(host) => host.hostId === deviceFilter,
	);
	const selectedProject = projectOptions.find(
		(project) => project.projectId === projectFilter,
	);
	const totalProjectCount = projectOptions.reduce(
		(total, project) => total + project.count,
		0,
	);

	return (
		<div className="border-b border-border">
			<div className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4">
				<h1 className="text-sm font-semibold tracking-tight">Workspaces</h1>

				<div className="flex flex-wrap items-center gap-2">
					<InputGroup className="w-72">
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

					<Select value={projectFilter} onValueChange={setProjectFilter}>
						<SelectTrigger size="sm" className="min-w-[12rem]">
							<SelectValue placeholder="Filter projects">
								<ProjectFilterTriggerLabel
									projectFilter={projectFilter}
									selectedProject={selectedProject}
								/>
							</SelectValue>
						</SelectTrigger>
						<SelectContent align="end" className="min-w-[16rem]">
							<SelectGroup>
								<SelectItem value={PROJECT_FILTER_ALL}>
									<span className="flex w-full min-w-0 items-center gap-2">
										<LuFolders className="size-3.5" />
										<span className="min-w-0 flex-1 truncate">
											All projects
										</span>
										<span className="tabular-nums text-xs text-muted-foreground">
											{totalProjectCount}
										</span>
									</span>
								</SelectItem>
							</SelectGroup>

							{projectOptions.length > 0 ? (
								<>
									<SelectSeparator />
									<SelectGroup>
										<SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
											Projects
										</SelectLabel>
										{projectOptions.map((project) => (
											<SelectItem
												key={project.projectId}
												value={project.projectId}
											>
												<span className="flex w-full min-w-0 items-center gap-2">
													<V2WorkspaceProjectIcon
														projectName={project.projectName}
														githubOwner={project.githubOwner}
														size="sm"
													/>
													<span className="min-w-0 flex-1 truncate">
														{project.projectName}
													</span>
													<span className="tabular-nums text-xs text-muted-foreground">
														{project.count}
													</span>
												</span>
											</SelectItem>
										))}
									</SelectGroup>
								</>
							) : null}
						</SelectContent>
					</Select>

					<Select value={deviceFilter} onValueChange={setDeviceFilter}>
						<SelectTrigger size="sm" className="min-w-[12rem]">
							<SelectValue placeholder="Filter devices">
								<DeviceFilterTriggerLabel
									deviceFilter={deviceFilter}
									selectedRemoteHost={selectedRemoteHost}
								/>
							</SelectValue>
						</SelectTrigger>
						<SelectContent align="end" className="min-w-[16rem]">
							<SelectGroup>
								<SelectItem value={DEVICE_FILTER_THIS_DEVICE}>
									<DeviceOptionLabel
										icon={<LuLaptop className="size-3.5" />}
										label="This device"
										count={counts.thisDevice}
									/>
								</SelectItem>
								<SelectItem value={DEVICE_FILTER_ALL}>
									<DeviceOptionLabel
										icon={<LuLayers className="size-3.5" />}
										label="All devices"
										count={counts.all}
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
													count={host.count}
													isOnline={host.isOnline}
												/>
											</SelectItem>
										))}
									</SelectGroup>
								</>
							) : null}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}

interface ProjectFilterTriggerLabelProps {
	projectFilter: string;
	selectedProject: V2WorkspaceProjectOption | undefined;
}

function ProjectFilterTriggerLabel({
	projectFilter,
	selectedProject,
}: ProjectFilterTriggerLabelProps) {
	if (projectFilter === PROJECT_FILTER_ALL || !selectedProject) {
		return (
			<span className="flex items-center gap-2">
				<LuFolders className="size-3.5" />
				<span>All projects</span>
			</span>
		);
	}
	return (
		<span className="flex min-w-0 items-center gap-2">
			<V2WorkspaceProjectIcon
				projectName={selectedProject.projectName}
				githubOwner={selectedProject.githubOwner}
				size="sm"
			/>
			<span className="min-w-0 truncate">{selectedProject.projectName}</span>
		</span>
	);
}

interface DeviceFilterTriggerLabelProps {
	deviceFilter: string;
	selectedRemoteHost: V2WorkspaceHostOption | undefined;
}

function DeviceFilterTriggerLabel({
	deviceFilter,
	selectedRemoteHost,
}: DeviceFilterTriggerLabelProps) {
	if (deviceFilter === DEVICE_FILTER_ALL) {
		return (
			<span className="flex items-center gap-2">
				<LuLayers className="size-3.5" />
				<span>All devices</span>
			</span>
		);
	}
	if (deviceFilter === DEVICE_FILTER_THIS_DEVICE) {
		return (
			<span className="flex items-center gap-2">
				<LuLaptop className="size-3.5" />
				<span>This device</span>
			</span>
		);
	}
	return (
		<span className="flex min-w-0 items-center gap-2">
			<LuMonitor className="size-3.5" />
			<span className="min-w-0 truncate">
				{selectedRemoteHost?.hostName ?? "Unknown device"}
			</span>
			{selectedRemoteHost ? (
				<span
					aria-hidden
					className={cn(
						"inline-block size-1.5 shrink-0 rounded-full",
						selectedRemoteHost.isOnline
							? "bg-emerald-500"
							: "bg-muted-foreground/40",
					)}
				/>
			) : null}
		</span>
	);
}

interface DeviceOptionLabelProps {
	icon: React.ReactNode;
	label: string;
	count: number;
	isOnline?: boolean;
}

function DeviceOptionLabel({
	icon,
	label,
	count,
	isOnline,
}: DeviceOptionLabelProps) {
	return (
		<span className="flex w-full min-w-0 items-center gap-2">
			{icon}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{isOnline !== undefined ? (
				<span
					aria-hidden
					className={cn(
						"inline-block size-1.5 rounded-full",
						isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
					)}
				/>
			) : null}
			<span className="tabular-nums text-xs text-muted-foreground">
				{count}
			</span>
		</span>
	);
}
