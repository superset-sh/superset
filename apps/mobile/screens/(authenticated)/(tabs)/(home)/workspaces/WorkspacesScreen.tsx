import { LegendList } from "@legendapp/list/react-native";
import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { compareDesc, isAfter } from "date-fns";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/text";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import {
	type FilterableHost,
	type FilterableProject,
	WorkspaceFilterSheet,
	type WorkspaceSort,
} from "./components/WorkspaceFilterSheet";
import { prStateFor, WorkspaceRow } from "./components/WorkspaceRow";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

export function WorkspacesScreen() {
	const [sheetOpen, setSheetOpen] = useState(false);
	const [filterSheetOpen, setFilterSheetOpen] = useState(false);
	const [projectFilter, setProjectFilter] = useState<string | null>(null);
	const [hostFilter, setHostFilter] = useState<string | null>(null);
	const [sort, setSort] = useState<WorkspaceSort>("updatedAt");
	const [visibleIds, setVisibleIds] = useState<string[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const { width } = useWindowDimensions();
	const collections = useCollections();
	const queryClient = useQueryClient();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const { workspaces, isReady, cache } = useHostWorkspaces();

	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);
	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
		[collections],
	);
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const sortedProjects = useMemo(
		() => [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
		[projects],
	);

	const filterableProjects = useMemo<FilterableProject[]>(() => {
		const counts = new Map<string, number>();
		for (const workspace of workspaces) {
			counts.set(
				workspace.projectId,
				(counts.get(workspace.projectId) ?? 0) + 1,
			);
		}
		return sortedProjects.map((project) => ({
			id: project.id,
			name: project.name,
			iconUrl: project.iconUrl,
			workspaceCount: counts.get(project.id) ?? 0,
		}));
	}, [sortedProjects, workspaces]);

	const selectedProjectId = projectFilter ?? sortedProjects[0]?.id ?? null;
	const selectedProject = sortedProjects.find(
		(project) => project.id === selectedProjectId,
	);

	const filterableHosts = useMemo<FilterableHost[]>(() => {
		const counts = new Map<string, number>();
		for (const workspace of workspaces) {
			if (workspace.projectId !== selectedProjectId) continue;
			counts.set(workspace.hostId, (counts.get(workspace.hostId) ?? 0) + 1);
		}
		return (hosts ?? [])
			.map((host) => ({
				machineId: host.machineId,
				name: host.name,
				isOnline: host.isOnline,
				workspaceCount: counts.get(host.machineId) ?? 0,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [hosts, workspaces, selectedProjectId]);

	const visibleWorkspaces = useMemo<HostWorkspaceItem[]>(() => {
		return workspaces
			.filter(
				(workspace) =>
					workspace.projectId === selectedProjectId &&
					(hostFilter === null || workspace.hostId === hostFilter),
			)
			.sort((a, b) => compareDesc(a[sort], b[sort]));
	}, [workspaces, selectedProjectId, hostFilter, sort]);

	const workspacesById = useMemo(
		() => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
		[workspaces],
	);

	const pullRequestsByRepoBranch = useMemo(() => {
		const rank = { closed: 3, draft: 1, merged: 2, open: 0 } as const;
		const byRepoBranch = new Map<string, SelectGithubPullRequest>();
		for (const pullRequest of pullRequests ?? []) {
			const key = `${pullRequest.repositoryId}::${pullRequest.headBranch}`;
			const existing = byRepoBranch.get(key);
			if (!existing) {
				byRepoBranch.set(key, pullRequest);
				continue;
			}
			const cmp = rank[prStateFor(pullRequest)] - rank[prStateFor(existing)];
			if (
				cmp < 0 ||
				(cmp === 0 && isAfter(pullRequest.updatedAt, existing.updatedAt))
			) {
				byRepoBranch.set(key, pullRequest);
			}
		}
		return byRepoBranch;
	}, [pullRequests]);

	const diffStats = useVisibleDiffStats({
		visibleIds,
		workspacesById,
		resolveHostUrl: cache.resolveHostUrl,
	});

	const onViewableItemsChanged = useCallback(
		({
			viewableItems,
		}: {
			viewableItems: Array<{ item: HostWorkspaceItem; isViewable: boolean }>;
		}) => {
			setVisibleIds(
				viewableItems
					.filter((viewable) => viewable.isViewable)
					.slice(0, MAX_VISIBLE_DIFF_STATS)
					.map((viewable) => viewable.item.id),
			);
		},
		[],
	);

	const refreshHostData = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaces", "list"],
		});
		void queryClient.invalidateQueries({ queryKey: ["diff-stats"] });
	}, [queryClient]);

	useFocusEffect(refreshHostData);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await queryClient
			.refetchQueries({ queryKey: ["host-service", "workspaces", "list"] })
			.catch(() => {});
		void queryClient.invalidateQueries({ queryKey: ["diff-stats"] });
		setRefreshing(false);
	}, [queryClient]);

	const projectRepositoryId = selectedProject?.githubRepositoryId ?? null;

	const renderItem = useCallback(
		({ item }: { item: HostWorkspaceItem }) => (
			<WorkspaceRow
				workspace={item}
				pullRequest={
					projectRepositoryId
						? pullRequestsByRepoBranch.get(
								`${projectRepositoryId}::${item.branch}`,
							)
						: undefined
				}
				diffStats={diffStats.get(item.id) ?? null}
				cache={cache}
			/>
		),
		[pullRequestsByRepoBranch, projectRepositoryId, diffStats, cache],
	);

	const handleSwitchOrganization = (organizationId: string) => {
		setSheetOpen(false);
		switchOrganization(organizationId);
	};

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => setSheetOpen(true)}
			/>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="line.3.horizontal.decrease"
					onPress={() => setFilterSheetOpen(true)}
				/>
			</Stack.Toolbar>
			<LegendList
				className="flex-1 bg-background"
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: 112,
					paddingTop: 8,
				}}
				data={visibleWorkspaces}
				extraData={renderItem}
				keyExtractor={(item: HostWorkspaceItem) => item.id}
				renderItem={renderItem}
				viewabilityConfig={VIEWABILITY_CONFIG}
				onViewableItemsChanged={onViewableItemsChanged}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				ListEmptyComponent={
					isReady ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								No workspaces in this project yet
							</Text>
						</View>
					) : null
				}
			/>
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
			<WorkspaceFilterSheet
				isPresented={filterSheetOpen}
				onIsPresentedChange={setFilterSheetOpen}
				projects={filterableProjects}
				selectedProjectId={selectedProjectId}
				onSelectProject={setProjectFilter}
				hosts={filterableHosts}
				selectedHostId={hostFilter}
				onSelectHost={setHostFilter}
				sort={sort}
				onChangeSort={setSort}
				width={width}
			/>
		</>
	);
}
