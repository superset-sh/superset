import { LegendList } from "@legendapp/list/react-native";
import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { compareDesc, isAfter } from "date-fns";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { THEME } from "@/lib/theme";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { prStateFor, WorkspaceRow } from "./components/WorkspaceRow";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import { useWorkspacesFilterStore } from "./stores/workspacesFilterStore";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

export function WorkspacesScreen() {
	const router = useRouter();
	const [sheetOpen, setSheetOpen] = useState(false);
	const projectFilter = useWorkspacesFilterStore(
		(store) => store.projectFilter,
	);
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const [searchQuery, setSearchQuery] = useState("");
	const [visibleIds, setVisibleIds] = useState<string[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const { width, height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const collections = useCollections();
	const queryClient = useQueryClient();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const selectedHost = useSelectedHost();
	const { workspaces, isReady, cache } = useHostWorkspaces(selectedHost);

	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);
	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
		[collections],
	);

	const sortedProjects = useMemo(
		() => [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
		[projects],
	);

	const selectedProjectId = projectFilter ?? sortedProjects[0]?.id ?? null;

	const projectNamesById = useMemo(
		() =>
			new Map((projects ?? []).map((project) => [project.id, project.name])),
		[projects],
	);

	const visibleWorkspaces = useMemo<HostWorkspaceItem[]>(() => {
		const needle = searchQuery.trim().toLowerCase();
		const matches = needle
			? workspaces.filter(
					(workspace) =>
						workspace.name.toLowerCase().includes(needle) ||
						workspace.branch.toLowerCase().includes(needle) ||
						(projectNamesById.get(workspace.projectId) ?? "")
							.toLowerCase()
							.includes(needle),
				)
			: workspaces.filter(
					(workspace) =>
						workspace.projectId === selectedProjectId &&
						workspace.hostId === selectedHost?.machineId,
				);
		return matches.sort((a, b) => compareDesc(a[sort], b[sort]));
	}, [
		workspaces,
		selectedProjectId,
		selectedHost,
		sort,
		searchQuery,
		projectNamesById,
	]);

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

	const repositoryIdsByProject = useMemo(
		() =>
			new Map(
				(projects ?? []).map((project) => [
					project.id,
					project.githubRepositoryId,
				]),
			),
		[projects],
	);

	const renderItem = useCallback(
		({ item }: { item: HostWorkspaceItem }) => {
			const repositoryId = repositoryIdsByProject.get(item.projectId);
			return (
				<WorkspaceRow
					workspace={item}
					pullRequest={
						repositoryId
							? pullRequestsByRepoBranch.get(`${repositoryId}::${item.branch}`)
							: undefined
					}
					diffStats={diffStats.get(item.id) ?? null}
					cache={cache}
				/>
			);
		},
		[pullRequestsByRepoBranch, repositoryIdsByProject, diffStats, cache],
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
			<Stack.SearchBar
				placeholder="Search workspaces"
				placement="integratedButton"
				allowToolbarIntegration={false}
				hideNavigationBar={false}
				textColor={THEME.dark.foreground}
				hintTextColor={THEME.dark.mutedForeground}
				tintColor={THEME.dark.foreground}
				onChangeText={(event) => setSearchQuery(event.nativeEvent.text)}
				onCancelButtonPress={() => setSearchQuery("")}
			/>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="line.3.horizontal.decrease"
					onPress={() => router.push("/(authenticated)/(home)/filter")}
				/>
			</Stack.Toolbar>
			{selectedHost && !selectedHost.isOnline ? (
				<View
					className="bg-background flex-1"
					style={{
						minHeight:
							windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
					}}
				>
					<HostOfflineView hostName={selectedHost.name} />
				</View>
			) : (
				<LegendList
					className="flex-1 bg-background"
					contentInsetAdjustmentBehavior="automatic"
					contentContainerStyle={{
						minHeight:
							windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
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
									{searchQuery.trim()
										? "No workspaces match your search"
										: "No workspaces in this project yet"}
								</Text>
							</View>
						) : null
					}
				/>
			)}
			<NewChatWidget workspaces={workspaces} />
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
		</>
	);
}
