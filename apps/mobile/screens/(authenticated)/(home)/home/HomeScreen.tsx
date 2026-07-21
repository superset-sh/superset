import { LegendList } from "@legendapp/list/react-native";
import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
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
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { SessionRow } from "./components/SessionRow";
import { WorkspaceRow } from "./components/WorkspaceRow";
import { useHostAcpSessions } from "./hooks/useHostAcpSessions";
import { useHostTerminalAgents } from "./hooks/useHostTerminalAgents";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import { useWorkspacesFilterStore } from "./stores/workspacesFilterStore";
import { activityDateGroup } from "./utils/activityDateGroup";
import { prStateFor } from "./utils/prStateFor";
import { buildSessionRows, type SessionRowData } from "./utils/sessionRows";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

type HomeListItem =
	| { kind: "dateHeader"; label: string }
	| { kind: "workspace"; workspace: HostWorkspaceItem }
	| {
			kind: "session";
			workspaceId: string;
			row: SessionRowData;
			groupFirst: boolean;
			groupLast: boolean;
	  };

function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "dateHeader":
			return `date:${item.label}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		case "session":
			return `session:${item.row.id}`;
	}
}

export function HomeScreen() {
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
	const attentionByWorkspace = useHostTerminalAgents(selectedHost);

	// Projects are fully local — served by the selected host, not Electric.
	const { projects } = useHostProjects(selectedHost);
	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
		[collections],
	);
	const { sessionsByWorkspace } = useHostAcpSessions(selectedHost);

	const sortedProjects = useMemo(
		() => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
		[projects],
	);

	const selectedProjectId = projectFilter ?? sortedProjects[0]?.id ?? null;

	const projectNamesById = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name])),
		[projects],
	);

	const sessionRowsByWorkspace = useMemo(() => {
		const rowsByWorkspace = new Map<string, SessionRowData[]>();
		for (const [workspaceId, sessions] of sessionsByWorkspace) {
			rowsByWorkspace.set(workspaceId, buildSessionRows(sessions));
		}
		return rowsByWorkspace;
	}, [sessionsByWorkspace]);

	// Recency ranks a group by its latest activity — the newest of the
	// workspace's own update and its sessions' updates.
	const activityTs = useCallback(
		(workspace: HostWorkspaceItem) => {
			const workspaceTs = new Date(workspace[sort]).getTime();
			if (sort !== "updatedAt") return workspaceTs;
			const sessionTs = (sessionRowsByWorkspace.get(workspace.id) ?? []).reduce(
				(newest, row) => Math.max(newest, row.ts),
				0,
			);
			return Math.max(workspaceTs, sessionTs);
		},
		[sort, sessionRowsByWorkspace],
	);

	const visibleWorkspaces = useMemo<HostWorkspaceItem[]>(() => {
		const needle = searchQuery.trim().toLowerCase();
		const sessionsMatch = (workspaceId: string) =>
			(sessionRowsByWorkspace.get(workspaceId) ?? []).some((row) =>
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
						(projectNamesById.get(workspace.projectId) ?? "")
							.toLowerCase()
							.includes(needle) ||
						sessionsMatch(workspace.id),
				)
			: withWorktree.filter(
					(workspace) =>
						workspace.projectId === selectedProjectId &&
						workspace.hostId === selectedHost?.machineId,
				);
		return matches.sort((a, b) => activityTs(b) - activityTs(a));
	}, [
		workspaces,
		selectedProjectId,
		selectedHost,
		searchQuery,
		projectNamesById,
		sessionRowsByWorkspace,
		activityTs,
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
			const rows = sessionRowsByWorkspace.get(workspace.id) ?? [];
			rows.forEach((row, rowIndex) => {
				items.push({
					kind: "session",
					workspaceId: workspace.id,
					row,
					groupFirst: rowIndex === 0,
					groupLast: rowIndex === rows.length - 1,
				});
			});
		}
		return items;
	}, [visibleWorkspaces, sessionRowsByWorkspace, activityTs]);

	const workspacesById = useMemo(
		() => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
		[workspaces],
	);

	const pullRequestsByRepoBranch = useMemo(() => {
		const rank = { closed: 3, draft: 1, merged: 2, open: 0 } as const;
		const byRepoBranch = new Map<string, SelectGithubPullRequest>();
		for (const pullRequest of pullRequests ?? []) {
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
		void queryClient.invalidateQueries({ queryKey: ["acp-sessions", "list"] });
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
			switch (item.kind) {
				case "dateHeader":
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
				case "workspace": {
					const { workspace } = item;
					const repoPrefix = repoPrefixesByProject.get(workspace.projectId);
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
						/>
					);
				}
				case "session":
					return (
						<View className={cn("ml-7", item.groupLast && "mb-2")}>
							<View
								className={cn(
									"bg-border absolute left-0 w-[1.5px] rounded-full",
									item.groupFirst ? "top-1" : "top-0",
									item.groupLast ? "bottom-3" : "bottom-0",
								)}
							/>
							<SessionRow
								row={item.row}
								className="gap-2.5 py-2 pr-4 pl-4"
								onPress={() =>
									router.push(
										`/(authenticated)/workspace/${item.workspaceId}/chat/acp/${item.row.id}`,
									)
								}
							/>
						</View>
					);
			}
		},
		[
			pullRequestsByRepoBranch,
			repoPrefixesByProject,
			diffStats,
			cache,
			router,
			attentionByWorkspace,
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
			<Stack.SearchBar
				placeholder="Search workspaces & sessions"
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
