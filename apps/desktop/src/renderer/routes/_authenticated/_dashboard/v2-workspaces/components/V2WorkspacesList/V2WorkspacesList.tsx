import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { ItemGroup } from "@superset/ui/item";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuLayers, LuSearchX } from "react-icons/lu";
import type {
	AccessibleV2Workspace,
	V2WorkspaceHostType,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import type { AvailableV2Project } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAvailableV2Projects";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesDeviceFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { V2AvailableProjectsSection } from "../V2AvailableProjectsSection";
import { V2WorkspaceRow } from "./components/V2WorkspaceRow";

interface V2WorkspacesListProps {
	pinned: AccessibleV2Workspace[];
	others: AccessibleV2Workspace[];
	availableProjects: AvailableV2Project[];
	hasAnyAccessible: boolean;
	onCreateNewProject: () => void;
	onImportExistingFolder: () => void;
	onPinAndSetup: (project: AvailableV2Project) => void;
}

interface ProjectGroup {
	projectId: string;
	projectName: string;
	workspaces: AccessibleV2Workspace[];
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

function groupByProject(workspaces: AccessibleV2Workspace[]): ProjectGroup[] {
	const groupsById = new Map<string, ProjectGroup>();
	for (const workspace of workspaces) {
		const existing = groupsById.get(workspace.projectId);
		if (existing) {
			existing.workspaces.push(workspace);
		} else {
			groupsById.set(workspace.projectId, {
				projectId: workspace.projectId,
				projectName: workspace.projectName,
				workspaces: [workspace],
			});
		}
	}
	return Array.from(groupsById.values()).sort((a, b) => {
		const aLatest = Math.max(
			...a.workspaces.map((workspace) => workspace.createdAt.getTime()),
		);
		const bLatest = Math.max(
			...b.workspaces.map((workspace) => workspace.createdAt.getTime()),
		);
		return bLatest - aLatest;
	});
}

export function V2WorkspacesList({
	pinned,
	others,
	availableProjects,
	hasAnyAccessible,
	onCreateNewProject,
	onImportExistingFolder,
	onPinAndSetup,
}: V2WorkspacesListProps) {
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

	// `pinned` / `others` already have the search filter applied upstream in
	// useAccessibleV2Workspaces, so here we only narrow by device filter.
	const filteredPinnedGroups = useMemo(() => {
		const filtered = pinned.filter((workspace) =>
			matchesDeviceFilter(workspace.hostType, deviceFilter),
		);
		return groupByProject(filtered);
	}, [pinned, deviceFilter]);

	const filteredOtherGroups = useMemo(() => {
		const filtered = others.filter((workspace) =>
			matchesDeviceFilter(workspace.hostType, deviceFilter),
		);
		return groupByProject(filtered);
	}, [others, deviceFilter]);

	const pinnedCount = filteredPinnedGroups.reduce(
		(total, group) => total + group.workspaces.length,
		0,
	);
	const othersCount = filteredOtherGroups.reduce(
		(total, group) => total + group.workspaces.length,
		0,
	);
	const hasAnyMatches = pinnedCount > 0 || othersCount > 0;
	const hasActiveFilters = searchQuery.trim() !== "" || deviceFilter !== "all";

	// If the user has neither workspaces nor any cloud projects available to
	// pin, they genuinely have nothing — show the onboarding empty state
	// (which includes the Available section's create/import CTAs above it).
	if (!hasAnyAccessible && availableProjects.length === 0) {
		return (
			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-8 px-6 py-6">
					<V2AvailableProjectsSection
						projects={availableProjects}
						onCreateNewProject={onCreateNewProject}
						onImportExistingFolder={onImportExistingFolder}
						onPinAndSetup={onPinAndSetup}
					/>
					<Empty className="border-0">
						<EmptyHeader>
							<EmptyMedia
								variant="icon"
								className="size-14 [&_svg:not([class*='size-'])]:size-7"
							>
								<LuLayers />
							</EmptyMedia>
							<EmptyTitle>No workspaces yet</EmptyTitle>
							<EmptyDescription>
								Create a new project above to get started. Workspaces you have
								access to across all your devices will show up here.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			</ScrollArea>
		);
	}

	if (!hasAnyMatches && availableProjects.length === 0) {
		return (
			<Empty className="flex-1 border-0">
				<EmptyHeader>
					<EmptyMedia
						variant="icon"
						className="size-14 [&_svg:not([class*='size-'])]:size-7"
					>
						<LuSearchX />
					</EmptyMedia>
					<EmptyTitle>No workspaces match your filters</EmptyTitle>
					<EmptyDescription>
						Try a different search term or clear the device filter.
					</EmptyDescription>
				</EmptyHeader>
				{hasActiveFilters ? (
					<EmptyContent>
						<Button variant="outline" size="sm" onClick={() => resetFilters()}>
							Clear filters
						</Button>
					</EmptyContent>
				) : null}
			</Empty>
		);
	}

	const renderProjectGroups = (groups: ProjectGroup[]) => (
		<div className="flex flex-col gap-5">
			{groups.map((group) => (
				<div key={group.projectId} className="flex flex-col gap-2">
					<div className="flex items-baseline gap-2 px-1">
						<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{group.projectName}
						</h3>
						<span className="text-xs text-muted-foreground/70">
							{group.workspaces.length}
						</span>
					</div>
					<ItemGroup className="gap-2">
						{group.workspaces.map((workspace) => (
							<V2WorkspaceRow
								key={workspace.id}
								workspace={workspace}
								showProjectName={false}
								isCurrentRoute={workspace.id === currentWorkspaceId}
							/>
						))}
					</ItemGroup>
				</div>
			))}
		</div>
	);

	return (
		<ScrollArea className="flex-1">
			<div className="flex flex-col gap-8 px-6 py-6">
				<V2AvailableProjectsSection
					projects={availableProjects}
					onCreateNewProject={onCreateNewProject}
					onImportExistingFolder={onImportExistingFolder}
					onPinAndSetup={onPinAndSetup}
				/>

				{pinnedCount > 0 ? (
					<section className="flex flex-col gap-3">
						<div className="flex items-baseline gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								In your sidebar
							</h2>
							<span className="text-xs text-muted-foreground">
								{pinnedCount}
							</span>
						</div>
						{renderProjectGroups(filteredPinnedGroups)}
					</section>
				) : null}

				{othersCount > 0 ? (
					<section className="flex flex-col gap-3">
						<div className="flex items-baseline gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								Other workspaces
							</h2>
							<span className="text-xs text-muted-foreground">
								{othersCount}
							</span>
						</div>
						{renderProjectGroups(filteredOtherGroups)}
					</section>
				) : null}
			</div>
		</ScrollArea>
	);
}
