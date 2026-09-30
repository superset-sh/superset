import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useCopyShareLink } from "renderer/routes/_authenticated/_dashboard/hooks/useCopyShareLink";
import { useOpenPullRequestInApp } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
import {
	type CloudSidebarEntry,
	type CloudSidebarGroup,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { isCloudWorkspaceRead } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useSaveAsEnvironmentIntent } from "renderer/stores/save-as-environment-intent";
import type { CloudPullRequestRecord } from "../../../../../../hooks/useCloudPullRequests";
import { useDashboardSidebarPortKill } from "../../../../hooks/useDashboardSidebarPortKill";
import { usePortOpener } from "../../../../hooks/usePortOpenActions";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { usePortForwardLookup } from "../../../../providers/PortForwardsProvider";
import { DashboardSidebarCloudContextMenu } from "../DashboardSidebarCloudContextMenu";
import { DashboardSidebarCloudRow } from "../DashboardSidebarCloudRow";
import { DashboardSidebarPortsCard } from "../DashboardSidebarPortsCard";
import { useCloudWorkspaceMenuMutations } from "./hooks/useCloudWorkspaceMenuMutations";

interface DashboardSidebarCloudItemProps {
	workspace: CloudWorkspaceRow;
	organizationId: string;
	isMine: boolean;
	entry: CloudSidebarEntry | undefined;
	groups: CloudSidebarGroup[];
	branch: string;
	repoFullName: string | null;
	pullRequest: CloudPullRequestRecord | null;
	linkedTaskIds: ReadonlySet<string>;
	labels: { id: string; name: string; color: string | null }[];
	knownLabels: { id: string; name: string; color: string | null }[];
	projects: {
		id: string;
		name: string;
		icon: string | null;
		color: string | null;
	}[];
	now: Date;
	onCreateGroup: (workspaceId: string) => void;
	onHoverStart: (anchor: HTMLElement) => void;
	onHoverEnd: () => void;
	onSuppressHover: (suppressed: boolean) => void;
}

export function DashboardSidebarCloudItem({
	workspace,
	organizationId,
	isMine,
	entry,
	groups,
	branch,
	repoFullName,
	pullRequest,
	linkedTaskIds,
	labels,
	knownLabels,
	projects,
	now,
	onCreateGroup,
	onHoverStart,
	onHoverEnd,
	onSuppressHover,
}: DashboardSidebarCloudItemProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { copyToClipboard } = useCopyToClipboard();
	const copyShareLink = useCopyShareLink();
	const { setProject, linkTask, unlinkTask, addLabel, removeLabel } =
		useCloudWorkspaceMenuMutations(organizationId);
	const { v2Workspaces: workspaceActions } = useOptimisticActions();
	const openPullRequest = useOpenPullRequestInApp();
	const requestSaveAsEnvironment = useSaveAsEnvironmentIntent(
		(state) => state.request,
	);
	const archiveShortcut = useHotkeyDisplay("CLOSE_WORKSPACE").text;
	const setInSidebar = useCloudSidebarStore((state) => state.setInSidebar);
	const moveToGroup = useCloudSidebarStore((state) => state.moveToGroup);
	const markRead = useCloudSidebarStore((state) => state.markRead);
	const markUnread = useCloudSidebarStore((state) => state.markUnread);

	const portGroup = useDashboardSidebarWorkspacePorts(workspace.id);
	const ports = portGroup?.ports ?? [];
	const forwardFor = usePortForwardLookup();
	const { openPort } = usePortOpener();
	const {
		isPending: isClosingPorts,
		killPort,
		killPorts,
	} = useDashboardSidebarPortKill();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspace.name);

	const isActive = !!matchRoute({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId: workspace.id },
		fuzzy: true,
	});
	const isRead = isCloudWorkspaceRead(workspace, entry?.lastReadAt);
	const hasFinished = workspace.agentStatus === "review";

	const open = () => {
		if (isRenaming) return;
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: workspace.id },
		});
	};

	const submitRename = () => {
		setIsRenaming(false);
		const name = renameValue.trim();
		if (name && name !== workspace.name) {
			workspaceActions.renameWorkspace(workspace.id, name);
		}
	};

	const copy = (text: string, success: string) =>
		toast.promise(copyToClipboard(text), {
			success,
			error: (error) => errorMessage(error),
		});

	const closeAllPorts = async () => {
		const results = await killPorts(ports);
		const closedCount = results.filter((result) => result.success).length;
		if (closedCount > 0) {
			toast.success(
				t({
					message: plural(closedCount, {
						one: "Closed # port",
						other: "Closed # ports",
					}),
				}),
			);
		}
	};

	const repoOwner = repoFullName?.split("/")[0];

	return (
		<DashboardSidebarCloudContextMenu
			isUnread={hasFinished && !isRead}
			groups={groups}
			groupId={entry?.groupId ?? null}
			archiveShortcut={isActive ? archiveShortcut : null}
			isClosingPorts={isClosingPorts}
			onOpenChange={onSuppressHover}
			onOpenDetails={() =>
				navigate({
					to: "/cloud-workspaces/$workspaceId",
					params: { workspaceId: workspace.id },
				})
			}
			onRename={() => {
				setRenameValue(workspace.name);
				setIsRenaming(true);
			}}
			onSaveAsEnvironment={
				workspace.status === "ready"
					? () => requestSaveAsEnvironment(workspace.id)
					: undefined
			}
			projectId={workspace.projectId}
			projects={projects}
			linkedTaskIds={linkedTaskIds}
			labels={labels}
			knownLabels={knownLabels}
			onAddLabel={(name) => addLabel(workspace.id, name)}
			onRemoveLabel={(labelId) => removeLabel(workspace.id, labelId)}
			onSetProject={(projectId) => setProject(workspace.id, projectId)}
			onToggleTask={(task, isLinked) =>
				isLinked
					? unlinkTask(workspace.id, task.id)
					: linkTask(workspace.id, task)
			}
			onCopyLink={() => copyShareLink(`workspaces/${workspace.id}`)}
			onCopyWorkspaceId={() =>
				copy(workspace.id, t({ message: "Workspace ID copied" }))
			}
			onToggleUnread={
				hasFinished
					? () =>
							isRead
								? markUnread(organizationId, workspace.id)
								: markRead(
										organizationId,
										workspace.id,
										workspace.agentStatusAt?.getTime() ?? null,
									)
					: undefined
			}
			onCreateGroup={() => onCreateGroup(workspace.id)}
			onMoveToGroup={(groupId) =>
				moveToGroup(organizationId, workspace.id, groupId)
			}
			onCloseAllPorts={ports.length > 0 ? closeAllPorts : undefined}
			onHideFromSidebar={
				isMine
					? undefined
					: () => setInSidebar(organizationId, workspace.id, false)
			}
			onArchive={() =>
				useDeleteWorkspaceIntent.getState().request({
					workspaceId: workspace.id,
					workspaceName: workspace.name || branch,
				})
			}
		>
			<DashboardSidebarCloudRow
				onPointerEnter={(event) => onHoverStart(event.currentTarget)}
				onPointerLeave={onHoverEnd}
				onOpen={open}
				workspace={workspace}
				isMine={isMine}
				isRead={isRead}
				nameSlot={
					isRenaming ? (
						<RenameInput
							value={renameValue}
							onChange={setRenameValue}
							onSubmit={submitRename}
							onCancel={() => setIsRenaming(false)}
							className="h-5 min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] leading-tight text-foreground outline-none"
						/>
					) : undefined
				}
				repo={
					repoFullName
						? {
								name: repoFullName,
								iconUrl: resolveProjectIconUrl({
									icon: null,
									repoOwner: repoOwner || null,
								}),
							}
						: null
				}
				ports={
					ports.length > 0
						? {
								count: ports.length,
								onOpenChange: onSuppressHover,
								card: (
									<DashboardSidebarPortsCard
										ports={ports.map((port) => ({
											...port,
											forward: forwardFor(port),
										}))}
										isBusy={isClosingPorts}
										onOpenPort={(portNumber) => {
											const port = ports.find(
												(candidate) => candidate.port === portNumber,
											);
											if (port) openPort(port, forwardFor(port));
										}}
										onClosePort={(portNumber) => {
											const port = ports.find(
												(candidate) => candidate.port === portNumber,
											);
											if (port) void killPort(port);
										}}
										onCloseAll={() => void closeAllPorts()}
									/>
								),
							}
						: null
				}
				pullRequest={pullRequest}
				now={now}
				isActive={isActive}
				onOpenPullRequest={() => {
					if (pullRequest) openPullRequest(pullRequest.url);
				}}
				onArchive={() =>
					useDeleteWorkspaceIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name || branch,
					})
				}
			/>
		</DashboardSidebarCloudContextMenu>
	);
}
