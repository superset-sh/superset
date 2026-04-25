import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { useMatchRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuLayers, LuSearchX } from "react-icons/lu";
import type {
	AccessibleV2Workspace,
	V2WorkspaceHostType,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesDeviceFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { SortableHeader } from "./components/SortableHeader";
import { V2WorkspaceRow } from "./components/V2WorkspaceRow";
import { V2_WORKSPACES_ROW_GRID } from "./constants";
import type { SortDirection, SortField } from "./types";

interface V2WorkspacesListProps {
	workspaces: AccessibleV2Workspace[];
}

interface ProjectGroup {
	projectId: string;
	projectName: string;
	workspaces: AccessibleV2Workspace[];
	latestCreatedAt: number;
}

function matchesDeviceFilter(
	hostType: V2WorkspaceHostType,
	deviceFilter: V2WorkspacesDeviceFilter,
): boolean {
	switch (deviceFilter) {
		case "all":
			return true;
		case "this-device":
			return hostType === "local-device";
		case "other-devices":
			return hostType === "remote-device";
		case "cloud":
			return hostType === "cloud";
	}
}

// Host-type rank used as a tiebreaker when sorting by host — keeps local
// device first, then remote devices, then cloud.
function hostTypeRank(hostType: V2WorkspaceHostType): number {
	switch (hostType) {
		case "local-device":
			return 0;
		case "remote-device":
			return 1;
		case "cloud":
			return 2;
	}
}

function compareWorkspaces(
	a: AccessibleV2Workspace,
	b: AccessibleV2Workspace,
	field: SortField,
	direction: SortDirection,
): number {
	let cmp = 0;
	switch (field) {
		case "sidebar":
			cmp = Number(a.isInSidebar) - Number(b.isInSidebar);
			break;
		case "name":
			cmp = a.name.localeCompare(b.name);
			break;
		case "host":
			cmp = hostTypeRank(a.hostType) - hostTypeRank(b.hostType);
			if (cmp === 0) cmp = a.hostName.localeCompare(b.hostName);
			break;
		case "branch":
			cmp = a.branch.localeCompare(b.branch);
			break;
		case "created":
			cmp = a.createdAt.getTime() - b.createdAt.getTime();
			break;
	}
	if (cmp === 0) {
		cmp = b.createdAt.getTime() - a.createdAt.getTime();
	}
	return direction === "asc" ? cmp : -cmp;
}

function groupByProject(
	workspaces: AccessibleV2Workspace[],
	sortField: SortField,
	sortDirection: SortDirection,
): ProjectGroup[] {
	const projectsById = new Map<string, ProjectGroup>();

	for (const workspace of workspaces) {
		let project = projectsById.get(workspace.projectId);
		if (!project) {
			project = {
				projectId: workspace.projectId,
				projectName: workspace.projectName,
				workspaces: [],
				latestCreatedAt: 0,
			};
			projectsById.set(workspace.projectId, project);
		}
		project.workspaces.push(workspace);
		const createdAt = workspace.createdAt.getTime();
		if (createdAt > project.latestCreatedAt) {
			project.latestCreatedAt = createdAt;
		}
	}

	for (const project of projectsById.values()) {
		project.workspaces.sort((a, b) =>
			compareWorkspaces(a, b, sortField, sortDirection),
		);
	}

	return Array.from(projectsById.values()).sort(
		(a, b) => b.latestCreatedAt - a.latestCreatedAt,
	);
}

const DEFAULT_DIRECTION_BY_FIELD: Record<SortField, SortDirection> = {
	sidebar: "desc",
	name: "asc",
	host: "asc",
	branch: "asc",
	created: "desc",
};

export function V2WorkspacesList({ workspaces }: V2WorkspacesListProps) {
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const resetFilters = useV2WorkspacesFilterStore((state) => state.reset);

	const [sortField, setSortField] = useState<SortField>("created");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDirection(DEFAULT_DIRECTION_BY_FIELD[field]);
		}
	};

	const projectGroups = useMemo(() => {
		const filtered = workspaces.filter((workspace) =>
			matchesDeviceFilter(workspace.hostType, deviceFilter),
		);
		return groupByProject(filtered, sortField, sortDirection);
	}, [workspaces, deviceFilter, sortField, sortDirection]);

	const totalCount = projectGroups.reduce(
		(total, project) => total + project.workspaces.length,
		0,
	);
	const hasActiveFilters = searchQuery.trim() !== "" || deviceFilter !== "all";

	const columnHeader = (
		<div
			className={cn(
				V2_WORKSPACES_ROW_GRID,
				"sticky top-0 z-10 border-b border-border bg-background px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80",
			)}
		>
			<SortableHeader
				field="sidebar"
				label="In sidebar"
				align="center"
				srOnlyLabel
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="name"
				label="Name"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="host"
				label="Host"
				className="hidden md:flex"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="branch"
				label="Branch"
				className="hidden lg:flex"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="created"
				label="Created"
				className="hidden xl:flex"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
		</div>
	);

	if (totalCount === 0) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{columnHeader}
				<Empty className="flex-1 border-0">
					<EmptyHeader>
						<EmptyMedia
							variant="icon"
							className="size-14 [&_svg:not([class*='size-'])]:size-7"
						>
							{hasActiveFilters ? <LuSearchX /> : <LuLayers />}
						</EmptyMedia>
						<EmptyTitle>
							{hasActiveFilters
								? "No workspaces match your filters"
								: "No workspaces yet"}
						</EmptyTitle>
						<EmptyDescription>
							{hasActiveFilters
								? "Try a different search term or clear the device filter."
								: "Workspaces you have access to across all your devices will show up here."}
						</EmptyDescription>
					</EmptyHeader>
					{hasActiveFilters ? (
						<EmptyContent>
							<Button
								variant="outline"
								size="sm"
								onClick={() => resetFilters()}
							>
								Clear filters
							</Button>
						</EmptyContent>
					) : null}
				</Empty>
			</div>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1">
			<div className="flex w-full flex-col">
				{columnHeader}

				{projectGroups.map((project) => (
					<div key={project.projectId} className="flex flex-col">
						<div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-6 py-1.5">
							<h3
								className="min-w-0 truncate text-xs font-semibold text-foreground/80"
								title={project.projectName}
							>
								{project.projectName}
							</h3>
							<span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
								{project.workspaces.length}
							</span>
						</div>
						<ul className="flex flex-col">
							{project.workspaces.map((workspace) => (
								<V2WorkspaceRow
									key={workspace.id}
									workspace={workspace}
									isCurrentRoute={workspace.id === currentWorkspaceId}
								/>
							))}
						</ul>
					</div>
				))}
			</div>
		</ScrollArea>
	);
}
