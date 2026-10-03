import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useNow } from "renderer/hooks/useNow";
import { useOpenNewWorkspaceForHost } from "renderer/hooks/useOpenNewWorkspace";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import { useCloudWorkspaceRepositories } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceRepositories";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { buildCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import {
	type CloudPullRequestRef,
	cloudPullRequestRefKey,
	useCloudPullRequests,
} from "../../../../hooks/useCloudPullRequests";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarCloudGroup } from "./components/DashboardSidebarCloudGroup";
import { DashboardSidebarCloudHoverCard } from "./components/DashboardSidebarCloudHoverCard";
import { DashboardSidebarCloudHoverOverlay } from "./components/DashboardSidebarCloudHoverOverlay";
import { DashboardSidebarCloudItem } from "./components/DashboardSidebarCloudItem";
import { DashboardSidebarCloudRailItem } from "./components/DashboardSidebarCloudRailItem";
import { useCloudHoverCard } from "./hooks/useCloudHoverCard";
import { useOpenCloudWorkspacePullRequest } from "./hooks/useOpenCloudWorkspacePullRequest";

const NOW_TICK_MS = 30_000;

const NO_TASKS: ReadonlySet<string> = new Set();
const NO_LABELS: never[] = [];

export function DashboardSidebarCloudSection({
	isCollapsed,
	onWorkspaceHover,
}: {
	isCollapsed?: boolean;
	onWorkspaceHover?: (workspaceId: string) => void | Promise<void>;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const now = useNow(NOW_TICK_MS);
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const { workspaces: listedWorkspaces, isFresh: isListFresh } =
		useCloudWorkspaces();
	const cloudWorkspaces = useMemo(
		() => listedWorkspaces ?? [],
		[listedWorkspaces],
	);
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	// The same flag that offers Cloud in the device picker. Undefined means the
	// flags haven't resolved, which is neither a yes nor a no.
	const cloudFlag = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const isCloudEnabled = cloudFlag === true;
	const openNewWorkspaceForHost = useOpenNewWorkspaceForHost();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(state) => state.collapsed.cloud,
	);
	const sidebarState = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR)
			: EMPTY_CLOUD_SIDEBAR,
	);
	const createGroup = useCloudSidebarStore((state) => state.createGroup);
	const pruneEntries = useCloudSidebarStore((state) => state.pruneEntries);
	const markRead = useCloudSidebarStore((state) => state.markRead);
	const matchRoute = useMatchRoute();
	const activeMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const activeWorkspace = activeMatch
		? cloudWorkspaces.find(
				(workspace) => workspace.id === activeMatch.workspaceId,
			)
		: undefined;
	const activeWorkspaceId = activeWorkspace?.id ?? null;
	const activeNotifiedAt = activeWorkspace?.agentStatusAt?.getTime() ?? null;

	useEffect(() => {
		if (!organizationId || !activeWorkspaceId) return;
		markRead(organizationId, activeWorkspaceId, activeNotifiedAt);
	}, [organizationId, activeWorkspaceId, activeNotifiedAt, markRead]);
	const moveToGroup = useCloudSidebarStore((state) => state.moveToGroup);
	const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);

	useEffect(() => {
		if (!organizationId || !listedWorkspaces || !isListFresh) return;
		pruneEntries(
			organizationId,
			new Set(listedWorkspaces.map((workspace) => workspace.id)),
		);
	}, [organizationId, listedWorkspaces, isListFresh, pruneEntries]);
	const clearRenamingGroup = useCallback(() => setRenamingGroupId(null), []);

	const layout = useMemo(
		() =>
			buildCloudSidebar({
				workspaces: cloudWorkspaces,
				state: sidebarState,
				userId,
			}),
		[cloudWorkspaces, sidebarState, userId],
	);
	const shown = useMemo(
		() => [
			...layout.ungrouped,
			...layout.groups.flatMap(({ workspaces }) => workspaces),
		],
		[layout],
	);

	const { repositoriesById, primaryRepositoryById: repoFullNameById } =
		useCloudWorkspaceRepositories({
			organizationId,
			enabled: shown.length > 0,
		});
	const { data: taskLinks } = cloudTrpc.cloudWorkspace.tasks.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: isCloudEnabled && organizationId !== null, staleTime: 60_000 },
	);
	const tasksById = useMemo(() => {
		const byId = new Map<string, CloudTask[]>();
		for (const link of taskLinks ?? []) {
			const list = byId.get(link.cloudWorkspaceId) ?? [];
			list.push(link.task);
			byId.set(link.cloudWorkspaceId, list);
		}
		return byId;
	}, [taskLinks]);
	const linkedTaskIdsById = useMemo(
		() =>
			new Map(
				[...tasksById].map(([workspaceId, tasks]) => [
					workspaceId,
					new Set(tasks.map((task) => task.id)),
				]),
			),
		[tasksById],
	);
	const { data: knownLabels } = cloudTrpc.taskLabel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: isCloudEnabled && organizationId !== null, staleTime: 60_000 },
	);
	const { data: labelLinks } = cloudTrpc.cloudWorkspace.labels.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: isCloudEnabled && organizationId !== null, staleTime: 60_000 },
	);
	const labelsById = useMemo(() => {
		const byLabelId = new Map(
			(knownLabels ?? []).map((label) => [label.id, label]),
		);
		const byId = new Map<string, NonNullable<typeof knownLabels>>();
		for (const link of labelLinks ?? []) {
			const label = byLabelId.get(link.labelId);
			if (!label) continue;
			byId.set(link.cloudWorkspaceId, [
				...(byId.get(link.cloudWorkspaceId) ?? []),
				label,
			]);
		}
		return byId;
	}, [knownLabels, labelLinks]);
	const { data: projects } = cloudTrpc.taskProject.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: isCloudEnabled && organizationId !== null, staleTime: 60_000 },
	);
	// Only the open box's sandbox is in the host fan-out; it knows the branch
	// the agent has moved to, every other box shows the one it was created on.
	const branchById = useMemo(
		() => new Map(hostWorkspaces.map((row) => [row.id, row.branch])),
		[hostWorkspaces],
	);
	const branchOf = (workspace: { id: string; branch: string }) =>
		branchById.get(workspace.id) ?? workspace.branch;

	const pullRequestRefs = useMemo<CloudPullRequestRef[]>(
		() =>
			shown.flatMap((workspace) => {
				const repoFullName = repoFullNameById.get(workspace.id);
				return repoFullName
					? [
							{
								repoFullName,
								headBranch: branchById.get(workspace.id) ?? workspace.branch,
							},
						]
					: [];
			}),
		[shown, repoFullNameById, branchById],
	);
	const cloudPullRequests = useCloudPullRequests(pullRequestRefs);
	const pullRequestOf = (workspace: { id: string; branch: string }) => {
		const repoFullName = repoFullNameById.get(workspace.id);
		return repoFullName
			? (cloudPullRequests.byRef.get(
					cloudPullRequestRefKey({
						repoFullName,
						headBranch: branchOf(workspace),
					}),
				) ?? null)
			: null;
	};

	const hoverCard = useCloudHoverCard();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const openPullRequest = useOpenCloudWorkspacePullRequest();
	const hoveredWorkspace = hoverCard.hoveredWorkspaceId
		? cloudWorkspaces.find(
				(workspace) => workspace.id === hoverCard.hoveredWorkspaceId,
			)
		: undefined;
	const hoveredPullRequest = hoveredWorkspace
		? pullRequestOf(hoveredWorkspace)
		: null;
	useEffect(() => {
		if (hoverCard.hoveredWorkspaceId) {
			void onWorkspaceHover?.(hoverCard.hoveredWorkspaceId);
		}
	}, [hoverCard.hoveredWorkspaceId, onWorkspaceHover]);

	if (cloudFlag === false || organizationId === null) return null;
	// The header carries the only way to create a cloud workspace, so it stays
	// with no rows; the collapsed rail has no headers, so there it is rows or
	// nothing.
	if (shown.length === 0 && (isCollapsed || !isCloudEnabled)) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{shown.map((workspace) => (
					<DashboardSidebarCloudRailItem
						key={workspace.id}
						workspaceId={workspace.id}
						name={workspace.name}
						repoFullName={repoFullNameById.get(workspace.id) ?? null}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	const createGroupFor = (workspaceId: string) => {
		const groupId = createGroup(organizationId, t({ message: "New group" }));
		moveToGroup(organizationId, workspaceId, groupId);
		setRenamingGroupId(groupId);
	};

	const renderItem = (workspace: (typeof shown)[number]) => {
		const branch = branchOf(workspace);
		const repoFullName = repoFullNameById.get(workspace.id) ?? null;
		return (
			<DashboardSidebarCloudItem
				key={workspace.id}
				workspace={workspace}
				organizationId={organizationId}
				isMine={userId !== null && workspace.createdBy?.userId === userId}
				entry={sidebarState.entries[workspace.id]}
				groups={sidebarState.groups}
				branch={branch}
				repoFullName={repoFullName}
				pullRequest={pullRequestOf(workspace)}
				linkedTaskIds={linkedTaskIdsById.get(workspace.id) ?? NO_TASKS}
				labels={labelsById.get(workspace.id) ?? NO_LABELS}
				knownLabels={knownLabels ?? NO_LABELS}
				projects={projects ?? []}
				now={now}
				onCreateGroup={createGroupFor}
				onHoverStart={(anchor) => hoverCard.rowEnter(workspace.id, anchor)}
				onHoverEnd={hoverCard.rowLeave}
				onSuppressHover={hoverCard.setSuppressed}
			/>
		);
	};

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Cloud" })}
				section="cloud"
			>
				{isCloudEnabled && (
					<Tooltip delayDuration={700}>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "New cloud workspace" })}
								onClick={(event) => {
									event.stopPropagation();
									openNewWorkspaceForHost(CLOUD_HOST_ID);
								}}
								onKeyDown={(event) => event.stopPropagation()}
								className="mr-[3px] flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<LuPlus className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>New cloud workspace</Trans>
						</TooltipContent>
					</Tooltip>
				)}
			</DashboardSidebarSectionHeader>
			{!isSectionCollapsed && (
				<div className="space-y-0.5">
					{layout.ungrouped.map(renderItem)}
					{layout.groups.map(({ group, workspaces }) => (
						<DashboardSidebarCloudGroup
							key={group.id}
							group={group}
							organizationId={organizationId}
							startRenaming={renamingGroupId === group.id}
							onRenameStarted={clearRenamingGroup}
						>
							<div className="space-y-0.5">{workspaces.map(renderItem)}</div>
						</DashboardSidebarCloudGroup>
					))}
				</div>
			)}
			<DashboardSidebarCloudHoverOverlay
				anchor={hoveredWorkspace ? hoverCard.anchor : null}
				onPointerEnter={hoverCard.cardEnter}
				onPointerLeave={hoverCard.cardLeave}
				onClose={hoverCard.close}
			>
				{hoveredWorkspace && (
					<DashboardSidebarCloudHoverCard
						workspace={hoveredWorkspace}
						repositories={repositoriesById.get(hoveredWorkspace.id) ?? []}
						tasks={tasksById.get(hoveredWorkspace.id) ?? []}
						pullRequests={hoveredPullRequest ? [hoveredPullRequest] : []}
						now={now}
						onOpenDetails={() =>
							navigate({
								to: "/cloud-workspaces/$workspaceId",
								params: { workspaceId: hoveredWorkspace.id },
							})
						}
						onOpenPerson={(userId) =>
							navigate({
								to: "/cloud-workspaces",
								search: { people: [userId] },
							})
						}
						onOpenTask={(taskId) =>
							navigate({ to: "/tasks/$taskId", params: { taskId } })
						}
						onOpenPullRequest={(url) =>
							openPullRequest(hoveredWorkspace.id, url)
						}
						onOpenRepository={(fullName) =>
							openUrl.mutate(`https://github.com/${fullName}`)
						}
					/>
				)}
			</DashboardSidebarCloudHoverOverlay>
		</div>
	);
}
