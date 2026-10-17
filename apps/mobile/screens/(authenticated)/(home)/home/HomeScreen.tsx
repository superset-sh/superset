import { LegendList } from "@legendapp/list/react-native";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useFormat } from "@superset/i18n/react";
import { groupCloudWorkspacesByTime } from "@superset/shared/cloud-workspace-groups";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { getWorkspaceActivityTime } from "@superset/shared/workspace-activity";
import { useQueryClient } from "@tanstack/react-query";
import { isAfter } from "date-fns";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Box } from "lucide-react-native";
import { useFeatureFlag } from "posthog-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useArchivedCloudWorkspaces } from "@/hooks/useArchivedCloudWorkspaces";
import { useCloudWorkspaceItems } from "@/hooks/useCloudWorkspaceItems";
import {
	type CloudWorkspaceRow,
	useCloudWorkspaces,
} from "@/hooks/useCloudWorkspaces";
import { useHostsProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostsWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { useReadableInset } from "@/hooks/useReadableInset";
import { useSession } from "@/lib/auth/client";
import { errorCopy } from "@/lib/errors";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import { useVoiceActive } from "@/lib/voice/voiceStore";
import { useCloudFilters } from "@/screens/(authenticated)/(home)/hooks/useCloudFilters";
import { useScopedHosts } from "@/screens/(authenticated)/(home)/hooks/useScopedHosts";
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
import { CloudWorkspaceRow as CloudWorkspaceListRow } from "./components/CloudWorkspaceRow";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { targetKeyFor } from "./components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "./components/NewChatWidget/stores/newSessionPreferencesStore";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { PeriodHeader } from "./components/PeriodHeader";
import { ProjectSectionHeader } from "./components/ProjectSectionHeader";
import { ScopeBar } from "./components/ScopeBar";
import { WorkspaceRow } from "./components/WorkspaceRow";
import { useAgentLiveActivity } from "./hooks/useAgentLiveActivity";
import { useAppReviewPrompt } from "./hooks/useAppReviewPrompt";
import {
	cloudPullRequestRefKey,
	useCloudPullRequests,
} from "./hooks/useCloudPullRequests";
import { useCloudRepos } from "./hooks/useCloudRepos";
import { useFirstPaint } from "./hooks/useFirstPaint";
import {
	type TerminalsHost,
	useHostsTerminals,
} from "./hooks/useHostTerminals";
import { useNow } from "./hooks/useNow";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import {
	ALL_HOSTS_SECTION_SCOPE,
	collapsedProjectKey,
	useCollapsedProjectsStore,
} from "./stores/collapsedProjectsStore";
import { useComposerFocusStore } from "./stores/composerFocusStore";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "./stores/workspacesFilterStore";
import {
	buildProjectSections,
	NO_PROJECT_SECTION_ID,
} from "./utils/buildProjectSections";

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
			/** Where its "+" starts work. */
			machineId: string;
			/** The machine, or All hosts: collapse is remembered per scope. */
			collapseScope: string;
			projectId: string;
			name: string;
			iconUrl?: string | null;
			count: number;
			collapsed: boolean;
	  }
	| {
			kind: "workspace";
			workspace: HostWorkspaceItem;
			hostName?: string;
	  }
	| {
			kind: "hostOffline";
			hostName: string;
			lastSeenAt: number | null | undefined;
	  }
	| {
			kind: "periodHeader";
			key: string;
			label: string;
	  }
	| { kind: "cloudRow"; row: CloudWorkspaceRow };

function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "projectHeader":
			return `project:${item.collapseScope}:${item.projectId}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		case "periodHeader":
			return `period:${item.key}`;
		case "cloudRow":
			return `cloud:${item.row.id}`;
		default:
			return "host-offline";
	}
}

const NOTICE_MS = 1500;

export function HomeScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const voice = useVoiceSession();
	const voiceActive = useVoiceActive();
	const voiceEnabled = Boolean(useFeatureFlag(FEATURE_FLAGS.MOBILE_VOICE_MODE));
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
	const headerHeight = useHeaderHeight();
	const readableInset = useReadableInset();
	const queryClient = useQueryClient();
	useAppReviewPrompt();
	const setTargetKey = useNewSessionPreferencesStore(
		(state) => state.setTargetKey,
	);
	const requestComposerFocus = useComposerFocusStore(
		(state) => state.requestFocus,
	);
	const { isLoadingOrganizations, activeOrganization, activeOrganizationId } =
		useOrganizations();

	const selectedHost = useSelectedHost();
	const scope = useWorkspaceScope();
	const cloudScope = scope === "cloud";
	const allHostsScope = scope === "allHosts";
	const scopedHosts = useScopedHosts();
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const {
		workspaces,
		isReady: workspacesReady,
		statusByHost,
		cache,
	} = useHostsWorkspaces(scopedHosts);
	const {
		items: cloudItems,
		cache: cloudCache,
		isReady: cloudReady,
	} = useCloudWorkspaceItems();
	const cloudFilters = useCloudFilters();
	const showArchived = cloudScope && cloudFilters.status === "archived";
	const { workspaces: archivedCloud, isReady: archivedReady } =
		useArchivedCloudWorkspaces({ enabled: showArchived });
	const { workspaces: activeCloud } = useCloudWorkspaces();
	const { formatRelativePeriod } = useFormat();
	const viewerId = useSession().data?.user?.id ?? null;
	const now = useNow(30_000);
	// No session marks for cloud rows: a request per sandbox keeps each one
	// awake for as long as Home is on screen.
	const terminalHosts = useMemo<TerminalsHost[]>(
		() => (cloudScope ? [] : scopedHosts),
		[scopedHosts, cloudScope],
	);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostsTerminals(terminalHosts);

	// Projects are fully local — served by each host, not the cloud.
	const { projectsByHost, isReady: projectsReady } =
		useHostsProjects(scopedHosts);
	const projects = useMemo(
		() => Object.values(projectsByHost).flat(),
		[projectsByHost],
	);

	// Mirrors the rows above onto the Lock Screen and Dynamic Island while the
	// app is open. Foreground-only for now: nothing server-side knows an agent
	// needs attention yet, so the card goes stale (and says so) once the app
	// closes. ActivityKit push updates are the follow-up that fixes that.
	const liveActivityEnabled = Boolean(
		useFeatureFlag(FEATURE_FLAGS.MOBILE_LIVE_ACTIVITY),
	);
	useAgentLiveActivity({
		terminalsByWorkspace,
		workspaces,
		projects,
		enabled: liveActivityEnabled,
	});
	const pullRequests = usePullRequests();
	const { query: hostsQuery, presenceStatus } = useOrgHosts();
	const presencePending = presenceStatus === "pending";
	const hostOffline =
		scope === "host" &&
		!!selectedHost &&
		!selectedHost.isOnline &&
		!presencePending;

	// An answer, not rows: an offline host and a host with no workspaces both
	// settle. Decoration is not waited on. With no active organization the
	// hosts query is disabled and stays pending forever, which is an answer of
	// its own — waiting on it there left the list spinning permanently.
	const contentReady =
		hasHydrated &&
		!isLoadingOrganizations &&
		(!activeOrganizationId || !hostsQuery.isPending) &&
		(cloudScope
			? showArchived
				? archivedReady
				: cloudReady
			: !presencePending && workspacesReady && projectsReady);

	const hasPainted = useFirstPaint(contentReady);

	const collapsed = useCollapsedProjectsStore((state) => state.collapsed);
	const collapseHydrated = useCollapsedProjectsStore(
		(state) => state.hasHydrated,
	);
	const toggleProject = useCollapsedProjectsStore(
		(state) => state.toggleProject,
	);

	// Recency ranks a workspace by its latest activity — the newest of its
	// own and its terminals'.
	const activityTs = useCallback(
		(workspace: HostWorkspaceItem) => {
			if (sort !== "updatedAt") return new Date(workspace[sort]).getTime();
			const workspaceTs = getWorkspaceActivityTime(workspace);
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

		// Under Cloud the list is desktop's: grouped by when each workspace last
		// heard from its agent (or was archived), newest first.
		if (cloudScope) {
			const rows = (showArchived ? archivedCloud : activeCloud).filter((row) =>
				cloudFilters.matchesCreator(row.createdByUserId),
			);
			const groups = groupCloudWorkspacesByTime({
				workspaces: rows,
				now,
				sort: sort === "createdAt" ? "created" : "activity",
				at: showArchived ? (row) => row.deletedAt ?? row.createdAt : undefined,
			});
			for (const { period, workspaces: grouped } of groups) {
				const key = `${showArchived ? "archived" : "active"}:${period.unit}:${period.count}`;
				items.push({
					kind: "periodHeader",
					key,
					label: formatRelativePeriod(period),
				});
				for (const row of grouped) items.push({ kind: "cloudRow", row });
			}
			return items;
		}

		// A machine's rows. When it is offline the whole scope gives way to the
		// placeholder — Cloud is a chip away rather than stranded above it.
		if (selectedHost && hostOffline) {
			items.push({
				kind: "hostOffline",
				hostName: selectedHost.name,
				lastSeenAt: selectedHost.lastSeenAt,
			});
			return items;
		}

		// Under All hosts a section holds the project's workspaces from every
		// machine that set it up, and each row names its machine.
		const collapseScope = allHostsScope
			? ALL_HOSTS_SECTION_SCOPE
			: selectedHost?.machineId;
		if (!collapseScope) return items;
		const hostNames = new Map(
			scopedHosts.map((host) => [host.machineId, host.name]),
		);
		const sections = buildProjectSections({
			workspaces: allHostsScope
				? liveWorkspaces
				: liveWorkspaces.filter(
						(workspace) => workspace.hostId === selectedHost?.machineId,
					),
			projectsByHost,
			noProjectName: t({ message: "No project" }),
			compareWorkspaces: byPinThenActivity,
			activityTs,
		});
		for (const section of sections) {
			const isCollapsed =
				collapseHydrated &&
				!!collapsed[collapsedProjectKey(collapseScope, section.projectId)];
			const newest = section.workspaces.reduce((a, b) =>
				activityTs(b) > activityTs(a) ? b : a,
			);
			items.push({
				kind: "projectHeader",
				machineId: newest.hostId,
				collapseScope,
				projectId: section.projectId,
				name: section.name,
				iconUrl: section.iconUrl,
				count: section.workspaces.length,
				collapsed: isCollapsed,
			});
			if (isCollapsed) continue;
			for (const workspace of section.workspaces) {
				items.push({
					kind: "workspace",
					workspace,
					hostName: allHostsScope ? hostNames.get(workspace.hostId) : undefined,
				});
			}
		}

		return items;
	}, [
		liveWorkspaces,
		cloudScope,
		showArchived,
		archivedCloud,
		activeCloud,
		cloudFilters.matchesCreator,
		sort,
		formatRelativePeriod,
		now,
		selectedHost,
		allHostsScope,
		scopedHosts,
		projectsByHost,
		byPinThenActivity,
		activityTs,
		collapsed,
		collapseHydrated,
		t,
		hostOffline,
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

	// Only on RE-focus: the first is the mount, where these queries already
	// fetch themselves, and invalidating there fetched every one of them twice
	// on a cold start.
	const hasFocused = useRef(false);
	useFocusEffect(
		useCallback(() => {
			if (!hasFocused.current) {
				hasFocused.current = true;
				return;
			}
			refreshHostData();
		}, [refreshHostData]),
	);

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
	const cloudRepos = useCloudRepos();
	const cloudPullRequests = useCloudPullRequests(
		useMemo(
			() =>
				listItems.flatMap((item) => {
					if (item.kind !== "cloudRow") return [];
					const repoFullName = cloudRepos.get(item.row.id);
					return repoFullName
						? [{ repoFullName, headBranch: item.row.branch }]
						: [];
				}),
			[listItems, cloudRepos],
		),
	);
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
			if (item.kind === "periodHeader") {
				return <PeriodHeader label={item.label} />;
			}
			if (item.kind === "cloudRow") {
				const repoFullName = cloudRepos.get(item.row.id);
				return (
					<CloudWorkspaceListRow
						row={item.row}
						repoFullName={repoFullName}
						pullRequest={
							repoFullName
								? cloudPullRequests.get(
										cloudPullRequestRefKey({
											repoFullName,
											headBranch: item.row.branch,
										}),
									)
								: undefined
						}
						viewerId={viewerId}
						now={now}
						cache={cloudCache}
						onCopied={handleCopied}
					/>
				);
			}
			if (item.kind === "hostOffline") {
				return (
					<View className="py-16">
						<HostOfflineView
							hostName={item.hostName}
							lastSeenAt={item.lastSeenAt}
						/>
					</View>
				);
			}
			if (item.kind === "projectHeader") {
				// Only a machine's projects get headers — Cloud is a flat scope.
				const { machineId, collapseScope } = item;
				const isNoProject = item.projectId === NO_PROJECT_SECTION_ID;
				return (
					<ProjectSectionHeader
						name={item.name}
						iconUrl={item.iconUrl}
						icon={
							isNoProject ? (
								<Icon as={Box} className="text-muted-foreground size-4" />
							) : undefined
						}
						count={item.count}
						collapsed={item.collapsed}
						onToggle={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							toggleProject(collapseScope, item.projectId);
						}}
						onNewWorkspace={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setTargetKey(
								targetKeyFor(isNoProject ? null : item.projectId, machineId),
							);
							requestComposerFocus();
						}}
					/>
				);
			}
			const { workspace, hostName } = item;
			const repoPrefix = workspace.projectId
				? repoPrefixesByProject.get(workspace.projectId)
				: undefined;
			return (
				<WorkspaceRow
					workspace={workspace}
					hostName={hostName}
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
					onCopied={handleCopied}
				/>
			);
		},
		[
			pullRequestsByRepoBranch,
			cloudRepos,
			cloudPullRequests,
			viewerId,
			now,
			repoPrefixesByProject,
			diffStats,
			cache,
			cloudCache,
			attentionByWorkspace,
			terminalsByWorkspace,
			toggleProject,
			setTargetKey,
			requestComposerFocus,
			handleCopied,
		],
	);

	// The native splash is still up until hideSplash() below; nothing to draw.
	if (!hasPainted) return null;

	const sortOption = SORT_OPTIONS.find((option) => option.value === sort);
	const sortLabel = sortOption ? i18n._(sortOption.label) : "";

	const scopeBar = (
		<ScopeBar
			scope={scope}
			hostName={selectedHost?.name ?? null}
			hostOnline={selectedHost?.isOnline ?? false}
			sortLabel={showArchived ? null : sortLabel}
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
					router.push("/(authenticated)/settings");
				}}
			/>
			{/* Search opens as a sheet rather than a search bar in this header: on
			    a root screen a UISearchController on iOS 26 lays an invisible view
			    over the content that swallows every touch (#6659); on the sheet's
			    own header the same bar works. Hidden while the host is
			    offline — its list isn't shown, so there is nothing to search. */}
			<Stack.Screen
				options={{
					headerTransparent: true,
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
			{selectedHost && hostOffline && !voiceEnabled ? null : (
				<Stack.Toolbar placement="right">
					{voiceEnabled ? (
						<Stack.Toolbar.Button
							icon="waveform"
							accessibilityLabel={t({ message: "Start voice mode" })}
							onPress={() => {
								void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
								void voice
									.start()
									.catch((error: unknown) =>
										Alert.alert(
											t({ message: "Couldn't start voice mode" }),
											errorCopy(error),
										),
									);
							}}
						/>
					) : null}
					<Stack.Toolbar.Button
						hidden={Boolean(selectedHost && hostOffline)}
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
			{selectedHost && hostOffline ? (
				<View
					className="bg-background flex-1"
					style={{
						minHeight:
							windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
						paddingTop: headerHeight,
						// On the outer view, not the ScrollView: the scope bar sits
						// outside it here, and both belong in the list's column.
						paddingHorizontal: readableInset,
					}}
				>
					{scopeBar}
					<ScrollView
						className="flex-1"
						contentContainerStyle={{
							flexGrow: 1,
							paddingTop: 24,
							paddingBottom: 112,
						}}
					>
						<HostOfflineView
							hostName={selectedHost.name}
							lastSeenAt={selectedHost.lastSeenAt}
						/>
					</ScrollView>
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
						paddingHorizontal: readableInset,
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
						contentReady ? (
							<View className="items-center justify-center py-20">
								<Text className="text-center text-muted-foreground">
									{showArchived
										? t({ message: "No archived workspaces" })
										: cloudScope && activeCloud.length > 0
											? t({
													message: "No cloud workspaces match these filters",
												})
											: cloudScope
												? t({
														message: "No cloud workspaces yet",
													})
												: !allHostsScope
													? t({
															message: "No projects on this host yet",
														})
													: presenceStatus === "unavailable" ||
															Object.values(statusByHost).includes("error")
														? t({ message: "Couldn't load workspaces" })
														: scopedHosts.every((host) => !host.isOnline)
															? t({ message: "None of your hosts are online" })
															: t({
																	message: "No workspaces on your hosts yet",
																})}
								</Text>
							</View>
						) : (
							// Timed out with answers outstanding: the list is unknown,
							// not empty, so neither nothing nor "No projects".
							<View className="items-center justify-center py-20">
								<ActivityIndicator />
							</View>
						)
					}
				/>
			)}
			{/* Cloud rows included: the row's "+" targets a workspace by id, and
			    the composer has to find a sandbox workspace as readily as a
			    machine's to start an agent in it. */}
			{voiceActive ? null : <NewChatWidget workspaces={composerWorkspaces} />}
		</>
	);
}
