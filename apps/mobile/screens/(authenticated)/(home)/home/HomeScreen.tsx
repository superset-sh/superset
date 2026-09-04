import { LegendList } from "@legendapp/list/react-native";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { isAfter } from "date-fns";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { HeaderNotice } from "@/screens/(authenticated)/components/HeaderNotice";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import {
	type OrgPullRequest,
	usePullRequests,
} from "@/screens/(authenticated)/hooks/usePullRequests";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import { pullRequestStatus } from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { targetKeyFor } from "./components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "./components/NewChatWidget/stores/newSessionPreferencesStore";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { ProjectSectionHeader } from "./components/ProjectSectionHeader";
import { ScopeBar } from "./components/ScopeBar";
import { WorkspaceRow } from "./components/WorkspaceRow";
import { useCloudRepoPrefix } from "./hooks/useCloudRepoPrefixes";
import {
	type TerminalsHost,
	useHostsTerminals,
} from "./hooks/useHostTerminals";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import {
	collapsedProjectKey,
	useCollapsedProjectsStore,
} from "./stores/collapsedProjectsStore";
import { useComposerFocusStore } from "./stores/composerFocusStore";
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
	| { kind: "hostOffline"; hostName: string };

function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "projectHeader":
			return `project:${item.projectId}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		default:
			return "host-offline";
	}
}

const NOTICE_MS = 1500;

export function HomeScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const hasHydrated = useWorkspacesFilterStore((store) => store.hasHydrated);
	const [visibleIds, setVisibleIds] = useState<string[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	// seq gives each notice its own identity: a repeat copy while "Copied" is
	// still up remounts HeaderNotice, restarting its timer.
	const [notice, setNotice] = useState<{ text: string; seq: number } | null>(
		null,
	);
	const hideNotice = useCallback(() => setNotice(null), []);
	const handleCopied = useCallback(
		() =>
			setNotice((prev) => ({
				text: t({ message: "Copied" }),
				seq: (prev?.seq ?? 0) + 1,
			})),
		[t],
	);
	const { height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();
	const setTargetKey = useNewSessionPreferencesStore(
		(state) => state.setTargetKey,
	);
	const requestComposerFocus = useComposerFocusStore(
		(state) => state.requestFocus,
	);
	const { isLoadingOrganizations, activeOrganization } = useOrganizations();

	const selectedHost = useSelectedHost();
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const { workspaces, isReady, cache } = useHostWorkspaces(selectedHost);
	const {
		items: cloudItems,
		cache: cloudCache,
		isReady: cloudReady,
	} = useCloudWorkspaceItems();
	const cloudScope = useWorkspaceScope() === "cloud";
	// No session marks for cloud rows: a request per sandbox keeps each one
	// awake for as long as Home is on screen.
	const terminalHosts = useMemo<TerminalsHost[]>(
		() => (cloudScope || !selectedHost ? [] : [selectedHost]),
		[selectedHost, cloudScope],
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

	const listItems = useMemo<HomeListItem[]>(() => {
		const items: HomeListItem[] = [];

		// Under Cloud the sandboxes are the whole list: flat, no project headers
		// to group them by and no machine to be offline.
		if (cloudScope) {
			for (const workspace of [...cloudItems].sort(byPinThenActivity)) {
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

		const pool = liveWorkspaces.filter(
			(workspace) => workspace.hostId === selectedHost?.machineId,
		);

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
				name: t({ message: "No project" }),
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
		byPinThenActivity,
		activityTs,
		collapsed,
		collapseHydrated,
		t,
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
	const cloudRepoPrefix = useCloudRepoPrefix();
	const repoPrefixesByProject = useMemo(
		() =>
			new Map<string, string | null>([
				...projects.map((project): [string, string | null] => [
					project.id,
					project.repoOwner && project.repoName
						? `https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase()
						: null,
				]),
			]),
		[projects],
	);

	const renderItem = useCallback(
		({ item }: { item: HomeListItem }) => {
			if (item.kind === "hostOffline") {
				return (
					<View className="py-16">
						<HostOfflineView hostName={item.hostName} />
					</View>
				);
			}
			if (item.kind === "projectHeader") {
				// Only a machine's projects get headers — Cloud is a flat scope.
				const machineId = selectedHost?.machineId;
				return (
					<ProjectSectionHeader
						name={item.name}
						iconUrl={item.iconUrl}
						count={item.count}
						collapsed={item.collapsed}
						onToggle={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							toggleProject(machineId ?? "", item.projectId);
						}}
						onNewWorkspace={
							// "__none" collects orphans of projects the host no longer
							// reports — there is nothing to create into.
							machineId && item.projectId !== "__none"
								? () => {
										void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										setTargetKey(targetKeyFor(item.projectId, machineId));
										requestComposerFocus();
									}
								: undefined
						}
					/>
				);
			}
			const { workspace, cloudStatus } = item;
			const repoPrefix = cloudStatus
				? cloudRepoPrefix
				: workspace.projectId
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
					onCopied={handleCopied}
				/>
			);
		},
		[
			pullRequestsByRepoBranch,
			cloudRepoPrefix,
			repoPrefixesByProject,
			diffStats,
			cache,
			cloudCache,
			attentionByWorkspace,
			terminalsByWorkspace,
			toggleProject,
			selectedHost,
			setTargetKey,
			requestComposerFocus,
			handleCopied,
		],
	);

	const sortOption = SORT_OPTIONS.find((option) => option.value === sort);
	const sortLabel = sortOption ? i18n._(sortOption.label) : "";

	const scopeBar = (
		<ScopeBar
			scope={cloudScope ? "cloud" : "host"}
			hostName={selectedHost?.name ?? null}
			hostOnline={selectedHost?.isOnline ?? false}
			sortLabel={sortLabel}
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
			{/* Search opens as a sheet rather than a search bar in this header: on
			    a root screen a UISearchController on iOS 26 lays an invisible view
			    over the content that swallows every touch (#6659); on the sheet's
			    own header the same bar works. Hidden while the host is
			    offline — its list isn't shown, so there is nothing to search. */}
			<Stack.Screen
				options={{
					headerTitle: notice
						? () => (
								<HeaderNotice
									key={notice.seq}
									onHidden={hideNotice}
									text={notice.text}
									visibleFor={NOTICE_MS}
								/>
							)
						: undefined,
				}}
			/>
			{!cloudScope && selectedHost && !selectedHost.isOnline ? null : (
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Button
						icon="magnifyingglass"
						accessibilityLabel={t({
							message: "Search workspaces",
						})}
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.push("/(authenticated)/(home)/search");
						}}
					/>
				</Stack.Toolbar>
			)}
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
					ListHeaderComponent={scopeBar}
					viewabilityConfig={VIEWABILITY_CONFIG}
					onViewableItemsChanged={onViewableItemsChanged}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
					ListEmptyComponent={
						isReady && cloudReady && hasHydrated && !isLoadingOrganizations ? (
							<View className="items-center justify-center py-20">
								<Text className="text-center text-muted-foreground">
									{cloudScope
										? t({
												message: "No cloud workspaces yet",
											})
										: t({
												message: "No projects on this host yet",
											})}
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
