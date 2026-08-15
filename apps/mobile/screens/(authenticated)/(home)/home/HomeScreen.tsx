import { LegendList } from "@legendapp/list/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { isAfter } from "date-fns";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useHostProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import {
	type OrgPullRequest,
	usePullRequests,
} from "@/screens/(authenticated)/hooks/usePullRequests";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { WorkspaceRow } from "./components/WorkspaceRow";
import { useHostTerminals } from "./hooks/useHostTerminals";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import { useWorkspacesFilterStore } from "./stores/workspacesFilterStore";
import { activityDateGroup } from "./utils/activityDateGroup";
import { prStateFor } from "./utils/prStateFor";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

type HomeListItem =
	| { kind: "dateHeader"; label: string }
	| { kind: "workspace"; workspace: HostWorkspaceItem };

function homeListItemKey(item: HomeListItem): string {
	return item.kind === "dateHeader"
		? `date:${item.label}`
		: `ws:${item.workspace.id}`;
}

export function HomeScreen() {
	const router = useRouter();
	const [sheetOpen, setSheetOpen] = useState(false);
	const projectFilter = useWorkspacesFilterStore(
		(store) => store.projectFilter,
	);
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const hasHydrated = useWorkspacesFilterStore((store) => store.hasHydrated);
	const [searchQuery, setSearchQuery] = useState("");
	const [visibleIds, setVisibleIds] = useState<string[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const { width, height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const selectedHost = useSelectedHost();
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const { workspaces, isReady, cache } = useHostWorkspaces(selectedHost);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostTerminals(selectedHost);

	// Projects are fully local — served by the selected host, not the cloud.
	const { projects } = useHostProjects(selectedHost);
	const pullRequests = usePullRequests();

	const sortedProjects = useMemo(
		() => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
		[projects],
	);

	// Default to where the user actually works — the most recently updated
	// workspace's project — not the alphabetically first project.
	const defaultProjectId = useMemo(() => {
		let newest: HostWorkspaceItem | null = null;
		for (const workspace of workspaces) {
			if (!workspace.projectId) continue;
			if (!newest || isAfter(workspace.updatedAt, newest.updatedAt)) {
				newest = workspace;
			}
		}
		return newest?.projectId ?? sortedProjects[0]?.id ?? null;
	}, [workspaces, sortedProjects]);

	// The saved project arrives a beat after mount; picking a default before
	// then flashes the wrong project's list on every cold start.
	const selectedProjectId = hasHydrated
		? (projectFilter ?? defaultProjectId)
		: null;

	const projectNamesById = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name])),
		[projects],
	);

	// Recency ranks a group by its latest activity — the newest of the
	// workspace's own update and its terminals' activity.
	const activityTs = useCallback(
		(workspace: HostWorkspaceItem) => {
			const workspaceTs = new Date(workspace[sort]).getTime();
			if (sort !== "updatedAt") return workspaceTs;
			const terminalTs = (terminalsByWorkspace.get(workspace.id) ?? []).reduce(
				(newest, row) => Math.max(newest, row.ts),
				0,
			);
			return Math.max(workspaceTs, terminalTs);
		},
		[sort, terminalsByWorkspace],
	);

	const visibleWorkspaces = useMemo<HostWorkspaceItem[]>(() => {
		const needle = searchQuery.trim().toLowerCase();
		const sessionsMatch = (workspaceId: string) =>
			(terminalsByWorkspace.get(workspaceId) ?? []).some((row) =>
				row.title.toLowerCase().includes(needle),
			);
		// A record whose worktree folder is gone from the host's disk is a
		// stale shell nothing can run in — not worth a list slot.
		const withWorktree = workspaces.filter(
			(workspace) => workspace.worktreeExists !== false,
		);
		const matches = needle
			? withWorktree.filter(
					(workspace) =>
						workspace.name.toLowerCase().includes(needle) ||
						workspace.branch.toLowerCase().includes(needle) ||
						(
							(workspace.projectId
								? projectNamesById.get(workspace.projectId)
								: undefined) ?? ""
						)
							.toLowerCase()
							.includes(needle) ||
						sessionsMatch(workspace.id),
				)
			: withWorktree.filter(
					(workspace) =>
						workspace.projectId === selectedProjectId &&
						workspace.hostId === selectedHost?.machineId,
				);
		// Pinned first (oldest pin leads, desktop's ordering), then activity.
		return matches.sort((a, b) => {
			const aPin = pinnedAt[a.id];
			const bPin = pinnedAt[b.id];
			if (aPin !== undefined || bPin !== undefined) {
				if (aPin === undefined) return 1;
				if (bPin === undefined) return -1;
				return aPin - bPin;
			}
			return activityTs(b) - activityTs(a);
		});
	}, [
		workspaces,
		selectedProjectId,
		selectedHost,
		searchQuery,
		projectNamesById,
		terminalsByWorkspace,
		activityTs,
		pinnedAt,
	]);

	const listItems = useMemo<HomeListItem[]>(() => {
		const items: HomeListItem[] = [];
		let lastGroup: string | null = null;
		for (const workspace of visibleWorkspaces) {
			const group = activityDateGroup(activityTs(workspace));
			if (group !== lastGroup) {
				items.push({ kind: "dateHeader", label: group });
				lastGroup = group;
			}
			items.push({ kind: "workspace", workspace });
		}
		return items;
	}, [visibleWorkspaces, activityTs]);

	const workspacesById = useMemo(
		() => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
		[workspaces],
	);

	const pullRequestsByRepoBranch = useMemo(() => {
		const rank = { closed: 3, draft: 1, merged: 2, open: 0 } as const;
		const byRepoBranch = new Map<string, OrgPullRequest>();
		for (const pullRequest of pullRequests) {
			// Key on repo coordinates from the PR URL — host projects don't
			// know cloud repo UUIDs.
			const repoPrefix = pullRequest.url
				.toLowerCase()
				.replace(/pull\/\d+.*$/, "");
			const key = `${repoPrefix}::${pullRequest.headBranch}`;
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
			viewableItems: Array<{ item: HomeListItem; isViewable: boolean }>;
		}) => {
			setVisibleIds(
				viewableItems
					.filter((viewable) => viewable.isViewable)
					.map((viewable) => viewable.item)
					.filter((item) => item.kind === "workspace")
					.slice(0, MAX_VISIBLE_DIFF_STATS)
					.map((item) => item.workspace.id),
			);
		},
		[],
	);

	const refreshHostData = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaces", "list"],
		});
		void queryClient.invalidateQueries({
			queryKey: ["host-terminals", "list"],
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
		void queryClient.invalidateQueries({ queryKey: ["cloud"] });
		setRefreshing(false);
	}, [queryClient]);

	// Projects are fully local: PR rows are matched by repo coordinates
	// parsed from the PR URL (cloud repo UUIDs aren't known host-side).
	const repoPrefixesByProject = useMemo(
		() =>
			new Map(
				projects.map((project) => [
					project.id,
					project.repoOwner && project.repoName
						? `https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase()
						: null,
				]),
			),
		[projects],
	);

	const renderItem = useCallback(
		({ item, index }: { item: HomeListItem; index: number }) => {
			if (item.kind === "dateHeader") {
				return (
					<Text
						className={cn(
							"text-muted-foreground px-4 pb-1 font-semibold text-xs",
							index === 0 ? undefined : "mt-6",
						)}
					>
						{item.label}
					</Text>
				);
			}
			const { workspace } = item;
			const repoPrefix = workspace.projectId
				? repoPrefixesByProject.get(workspace.projectId)
				: undefined;
			return (
				<WorkspaceRow
					workspace={workspace}
					pullRequest={
						repoPrefix
							? pullRequestsByRepoBranch.get(
									`${repoPrefix}::${workspace.branch}`,
								)
							: undefined
					}
					diffStats={diffStats.get(workspace.id) ?? null}
					cache={cache}
					attention={attentionByWorkspace.get(workspace.id) ?? null}
					sessions={terminalsByWorkspace.get(workspace.id) ?? []}
				/>
			);
		},
		[
			pullRequestsByRepoBranch,
			repoPrefixesByProject,
			diffStats,
			cache,
			attentionByWorkspace,
			terminalsByWorkspace,
		],
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
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					setSheetOpen(true);
				}}
			/>
			{/* placement="integratedButton" + allowToolbarIntegration={false}
			    evicts the custom left toolbar view (org switcher) a few seconds
			    after mount on iOS 26 — "stacked" is the only placement that
			    coexists with it. */}
			<Stack.SearchBar
				placeholder="Search workspaces"
				placement="stacked"
				hideWhenScrolling={false}
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
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(authenticated)/(home)/filter");
					}}
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
					data={listItems}
					extraData={renderItem}
					keyExtractor={homeListItemKey}
					renderItem={renderItem}
					viewabilityConfig={VIEWABILITY_CONFIG}
					onViewableItemsChanged={onViewableItemsChanged}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
					ListEmptyComponent={
						isReady && hasHydrated ? (
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
