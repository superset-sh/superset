import { LegendList } from "@legendapp/list/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { isAfter } from "date-fns";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
	type CloudWorkspaceStatus,
	useCloudWorkspaceItems,
} from "@/hooks/useCloudWorkspaceItems";
import { useHostProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import {
	type OrgPullRequest,
	usePullRequests,
} from "@/screens/(authenticated)/hooks/usePullRequests";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import { pullRequestStatus } from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { ProjectSectionHeader } from "./components/ProjectSectionHeader";
import { ScopeBar } from "./components/ScopeBar";
import { WorkspaceRow } from "./components/WorkspaceRow";
import { useCloudRepoPrefixes } from "./hooks/useCloudRepoPrefixes";
import {
	type TerminalsHost,
	useHostsTerminals,
} from "./hooks/useHostTerminals";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import {
	collapsedProjectKey,
	useCollapsedProjectsStore,
} from "./stores/collapsedProjectsStore";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "./stores/workspacesFilterStore";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

/**
 * Cloud is a scope of its own, picked from the same chip as your machines,
 * rather than a section pinned above whichever machine is selected. It belongs
 * to no host and, since a sandbox's project row is fabricated, to no project a
 * host knows — so under Cloud the rows are a flat list and the chip, not a
 * header, says where you are. Desktop pins it above the projects instead: a
 * sidebar can afford a permanent section, a phone list is the whole screen.
 */

type HomeListItem =
	| {
			kind: "projectHeader";
			projectId: string;
			name: string;
			iconUrl?: string | null;
			count: number;
			collapsed: boolean;
	  }
	| {
			kind: "workspace";
			workspace: HostWorkspaceItem;
			cloudStatus?: CloudWorkspaceStatus;
	  }
	| { kind: "note"; label: string }
	| { kind: "hostOffline"; hostName: string };

function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "projectHeader":
			return `project:${item.projectId}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		case "hostOffline":
			return "host-offline";
		default:
			return `note:${item.label}`;
	}
}

export function HomeScreen() {
	const router = useRouter();
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const hasHydrated = useWorkspacesFilterStore((store) => store.hasHydrated);
	const [searchQuery, setSearchQuery] = useState("");
	const [visibleIds, setVisibleIds] = useState<string[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const { height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();
	const { isLoadingOrganizations, activeOrganization } = useOrganizations();

	const selectedHost = useSelectedHost();
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const { workspaces, isReady, cache } = useHostWorkspaces(selectedHost);
	const {
		items: cloudItems,
		targets: sandboxes,
		cache: cloudCache,
		isReady: cloudReady,
	} = useCloudWorkspaceItems();
	const cloudScope = useWorkspaceScope() === "cloud";
	// Every addressed sandbox is a host of its own for the terminal fan-out,
	// so cloud rows get session marks and attention like any other row. Lazier
	// than the machine host on purpose: each sandbox is its own request, and a
	// phone paying N requests every 5s for list decoration is the mistake
	// desktop just walked back (#6570). Opening a workspace speeds up its own
	// host via the shared query key.
	// Only the scope on screen is polled: a sandbox costs its own request, and
	// paying for every one of them to decorate rows the list isn't showing is
	// the mistake desktop just walked back (#6570).
	const terminalHosts = useMemo<TerminalsHost[]>(
		() =>
			cloudScope
				? sandboxes.map((sandbox) => ({
						organizationId: sandbox.organizationId,
						machineId: sandbox.workspaceId,
						isOnline: true,
						refetchIntervalMs: 30_000,
					}))
				: selectedHost
					? [selectedHost]
					: [],
		[selectedHost, sandboxes, cloudScope],
	);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostsTerminals(terminalHosts);

	// Projects are fully local — served by the selected host, not the cloud.
	const { projects } = useHostProjects(selectedHost);
	const pullRequests = usePullRequests();

	const collapsed = useCollapsedProjectsStore((state) => state.collapsed);
	const collapseHydrated = useCollapsedProjectsStore(
		(state) => state.hasHydrated,
	);
	const toggleProject = useCollapsedProjectsStore(
		(state) => state.toggleProject,
	);

	const searching = searchQuery.trim().length > 0;

	// Recency ranks a workspace by its latest activity — the newest of its own
	// update and its terminals'.
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

	// Pinned first (oldest pin leads, desktop's ordering), then activity.
	const byPinThenActivity = useCallback(
		(a: HostWorkspaceItem, b: HostWorkspaceItem) => {
			const aPin = pinnedAt[a.id];
			const bPin = pinnedAt[b.id];
			if (aPin !== undefined || bPin !== undefined) {
				if (aPin === undefined) return 1;
				if (bPin === undefined) return -1;
				return aPin - bPin;
			}
			return activityTs(b) - activityTs(a);
		},
		[pinnedAt, activityTs],
	);

	// A record whose worktree folder is gone from the host's disk is a stale
	// shell nothing can run in — not worth a list slot.
	const liveWorkspaces = useMemo(
		() => workspaces.filter((workspace) => workspace.worktreeExists !== false),
		[workspaces],
	);

	const projectNamesById = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name])),
		[projects],
	);

	const matchesQuery = useCallback(
		(workspace: HostWorkspaceItem) => {
			const needle = searchQuery.trim().toLowerCase();
			if (!needle) return true;
			const sessions = terminalsByWorkspace.get(workspace.id) ?? [];
			return (
				workspace.name.toLowerCase().includes(needle) ||
				workspace.branch.toLowerCase().includes(needle) ||
				(
					(workspace.projectId
						? projectNamesById.get(workspace.projectId)
						: undefined) ?? ""
				)
					.toLowerCase()
					.includes(needle) ||
				sessions.some((row) => row.title.toLowerCase().includes(needle))
			);
		},
		[searchQuery, projectNamesById, terminalsByWorkspace],
	);

	const listItems = useMemo<HomeListItem[]>(() => {
		const items: HomeListItem[] = [];

		// Under Cloud the sandboxes are the whole list: flat, no project headers
		// to group them by and no machine to be offline.
		if (cloudScope) {
			const cloudPool = searching
				? cloudItems.filter(matchesQuery)
				: cloudItems;
			if (searching) {
				items.push({
					kind: "note",
					label: `${cloudPool.length} ${cloudPool.length === 1 ? "result" : "results"} in Cloud`,
				});
			}
			for (const workspace of [...cloudPool].sort(byPinThenActivity)) {
				items.push({
					kind: "workspace",
					workspace,
					cloudStatus: workspace.cloud.status,
				});
			}
			return items;
		}

		// A machine's rows. When it is offline the whole scope gives way to the
		// placeholder — Cloud is a chip away rather than stranded above it.
		if (selectedHost && !selectedHost.isOnline) {
			items.push({ kind: "hostOffline", hostName: selectedHost.name });
			return items;
		}

		const onThisHost = liveWorkspaces.filter(
			(workspace) => workspace.hostId === selectedHost?.machineId,
		);

		// Search reaches every project on this host but no further — the
		// workspace query is per-host, so other machines aren't in memory to
		// search. The count says "on this host" rather than implying otherwise.
		const pool = searching ? onThisHost.filter(matchesQuery) : onThisHost;

		if (searching) {
			items.push({
				kind: "note",
				label: `${pool.length} ${pool.length === 1 ? "result" : "results"} on this host`,
			});
		}

		// A project id the host no longer reports is as good as none: grouping
		// under it would render the workspace nowhere, since sections come from
		// the reported list. Also covers the beat where workspaces have loaded
		// and projects haven't.
		const knownProjectIds = new Set(projects.map((project) => project.id));
		const byProject = new Map<string, HostWorkspaceItem[]>();
		for (const workspace of pool) {
			const projectId =
				workspace.projectId && knownProjectIds.has(workspace.projectId)
					? workspace.projectId
					: "__none";
			const group = byProject.get(projectId);
			if (group) group.push(workspace);
			else byProject.set(projectId, [workspace]);
		}

		const sections = projects
			.map((project) => ({
				project,
				workspaces: (byProject.get(project.id) ?? []).sort(byPinThenActivity),
			}))
			// An empty section is a row that says nothing and does nothing — the
			// composer's project picker is where you start work in a project that
			// has none yet.
			.filter((section) => section.workspaces.length > 0)
			.sort((a, b) => {
				// Sections rank by their liveliest workspace, so the project you
				// were last in leads; empty ones fall to the bottom alphabetically.
				const first = (section: (typeof sections)[number]) =>
					section.workspaces[0];
				const aFirst = first(a);
				const bFirst = first(b);
				const aTs = aFirst ? activityTs(aFirst) : 0;
				const bTs = bFirst ? activityTs(bFirst) : 0;
				if (aTs !== bTs) return bTs - aTs;
				return a.project.name.localeCompare(b.project.name);
			});

		for (const section of sections) {
			const isCollapsed =
				!searching &&
				collapseHydrated &&
				!!collapsed[
					collapsedProjectKey(selectedHost?.machineId ?? "", section.project.id)
				];
			items.push({
				kind: "projectHeader",
				projectId: section.project.id,
				name: section.project.name,
				iconUrl: section.project.iconUrl,
				count: section.workspaces.length,
				collapsed: isCollapsed,
			});
			if (isCollapsed) continue;
			for (const workspace of section.workspaces) {
				items.push({ kind: "workspace", workspace });
			}
		}

		// Workspaces whose project the host no longer reports still need a home.
		const orphans = (byProject.get("__none") ?? []).sort(byPinThenActivity);
		if (orphans.length) {
			items.push({
				kind: "projectHeader",
				projectId: "__none",
				name: "No project",
				count: orphans.length,
				collapsed: false,
			});
			for (const workspace of orphans) {
				items.push({ kind: "workspace", workspace });
			}
		}

		return items;
	}, [
		liveWorkspaces,
		cloudItems,
		cloudScope,
		selectedHost,
		projects,
		searching,
		matchesQuery,
		byPinThenActivity,
		activityTs,
		collapsed,
		collapseHydrated,
	]);

	const composerWorkspaces = useMemo(
		() => [...workspaces, ...cloudItems],
		[workspaces, cloudItems],
	);
	const workspacesById = useMemo(
		() =>
			new Map(composerWorkspaces.map((workspace) => [workspace.id, workspace])),
		[composerWorkspaces],
	);

	const pullRequestsByRepoBranch = useMemo(() => {
		const rank = {
			closed: 3,
			draft: 1,
			merged: 2,
			open: 0,
			queued: 0,
		} as const;
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
			const cmp =
				rank[pullRequestStatus(pullRequest)] -
				rank[pullRequestStatus(existing)];
			if (
				cmp < 0 ||
				(cmp === 0 && isAfter(pullRequest.updatedAt, existing.updatedAt))
			) {
				byRepoBranch.set(key, pullRequest);
			}
		}
		return byRepoBranch;
	}, [pullRequests]);

	const resolveAnyHostUrl = useCallback(
		(hostId: string) =>
			cache.resolveHostUrl(hostId) ?? cloudCache.resolveHostUrl(hostId),
		[cache, cloudCache],
	);
	const diffStats = useVisibleDiffStats({
		visibleIds,
		workspacesById,
		resolveHostUrl: resolveAnyHostUrl,
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
	// Cloud rows' projects come from the API instead.
	const cloudRepoPrefixes = useCloudRepoPrefixes(cloudItems);
	const repoPrefixesByProject = useMemo(
		() =>
			new Map<string, string | null>([
				...cloudRepoPrefixes,
				...projects.map((project): [string, string | null] => [
					project.id,
					project.repoOwner && project.repoName
						? `https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase()
						: null,
				]),
			]),
		[projects, cloudRepoPrefixes],
	);

	const renderItem = useCallback(
		({ item }: { item: HomeListItem }) => {
			if (item.kind === "note") {
				return (
					<Text className="text-muted-foreground px-4 pb-1 pt-3 font-semibold text-xs">
						{item.label}
					</Text>
				);
			}
			if (item.kind === "hostOffline") {
				return (
					<View className="py-16">
						<HostOfflineView hostName={item.hostName} />
					</View>
				);
			}
			if (item.kind === "projectHeader") {
				// Only a machine's projects get headers — Cloud is a flat scope.
				return (
					<ProjectSectionHeader
						name={item.name}
						iconUrl={item.iconUrl}
						count={item.count}
						collapsed={item.collapsed}
						onToggle={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							toggleProject(selectedHost?.machineId ?? "", item.projectId);
						}}
					/>
				);
			}
			const { workspace, cloudStatus } = item;
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
					cache={cloudStatus === undefined ? cache : cloudCache}
					attention={attentionByWorkspace.get(workspace.id) ?? null}
					sessions={terminalsByWorkspace.get(workspace.id) ?? []}
					cloudStatus={cloudStatus}
				/>
			);
		},
		[
			pullRequestsByRepoBranch,
			repoPrefixesByProject,
			diffStats,
			cache,
			cloudCache,
			attentionByWorkspace,
			terminalsByWorkspace,
			toggleProject,
			selectedHost,
		],
	);

	const scopeBar = (
		<ScopeBar
			scope={cloudScope ? "cloud" : "host"}
			hostName={selectedHost?.name ?? null}
			hostOnline={selectedHost?.isOnline ?? false}
			sortLabel={
				SORT_OPTIONS.find((option) => option.value === sort)?.label ?? ""
			}
			onPressScope={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push("/(authenticated)/(home)/filter/scope");
			}}
			onPressSort={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push("/(authenticated)/(home)/filter/sort");
			}}
		/>
	);

	// Search lives in the page, not the native header: activating a
	// UISearchController on iOS 26 lays an invisible view over the screen's
	// content that swallows every touch — results can't be tapped and search
	// won't dismiss (unfixed through rns 4.27 / iOS 26.5).
	const listHeader = (
		<>
			<View className="px-4 pb-1 pt-1">
				<View className="relative justify-center">
					<View className="absolute left-3 z-10">
						<Icon
							as={Search}
							className="text-muted-foreground size-4"
							strokeWidth={2}
						/>
					</View>
					<Input
						autoCapitalize="none"
						autoCorrect={false}
						className="rounded-full pl-9"
						clearButtonMode="always"
						returnKeyType="search"
						onChangeText={setSearchQuery}
						placeholder="Search workspaces"
						value={searchQuery}
					/>
				</View>
			</View>
			{scopeBar}
		</>
	);

	return (
		<>
			<OrganizationHeaderButton
				isLoading={isLoadingOrganizations}
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					router.push("/(authenticated)/(home)/organizations");
				}}
			/>
			{!cloudScope && selectedHost && !selectedHost.isOnline ? (
				<View
					className="bg-background flex-1"
					style={{
						minHeight:
							windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
					}}
				>
					{scopeBar}
					<HostOfflineView hostName={selectedHost.name} />
				</View>
			) : (
				<LegendList
					className="flex-1 bg-background"
					contentInsetAdjustmentBehavior="automatic"
					keyboardDismissMode="on-drag"
					keyboardShouldPersistTaps="handled"
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
					ListHeaderComponent={listHeader}
					viewabilityConfig={VIEWABILITY_CONFIG}
					onViewableItemsChanged={onViewableItemsChanged}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
					ListEmptyComponent={
						isReady && cloudReady && hasHydrated && !isLoadingOrganizations ? (
							<View className="items-center justify-center py-20">
								<Text className="text-center text-muted-foreground">
									{searching
										? "No workspaces match your search"
										: cloudScope
											? "No cloud workspaces yet"
											: "No projects on this host yet"}
								</Text>
							</View>
						) : null
					}
				/>
			)}
			{/* Cloud rows included: the row's "+" targets a workspace by id, and
			    the composer has to find a sandbox workspace as readily as a
			    machine's to start an agent in it. */}
			<NewChatWidget workspaces={composerWorkspaces} />
		</>
	);
}
