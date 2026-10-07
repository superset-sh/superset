import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useMemo, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useNow } from "renderer/hooks/useNow";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NewProjectDialog } from "renderer/routes/_authenticated/_dashboard/components/NewProjectDialog";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { WorkspaceNotFoundState } from "renderer/routes/_authenticated/_dashboard/components/WorkspaceNotFoundState";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	cloudPullRequestRefKey,
	useCloudPullRequests,
} from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { useCopyShareLink } from "renderer/routes/_authenticated/_dashboard/hooks/useCopyShareLink";
import { useOpenPullRequestInApp } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useSetCloudWorkspaceVisibility } from "renderer/routes/_authenticated/_dashboard/hooks/useSetCloudWorkspaceVisibility";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useSaveAsEnvironmentIntent } from "renderer/stores/save-as-environment-intent";
import { useCloudWorkspaceRecordMutations } from "../../hooks/useCloudWorkspaceRecordMutations";
import type { CloudWorkspaceRecord } from "../../types";
import { toTimelineEntries } from "../../utils/toTimelineEntries";
import { CloudWorkspaceRecordView } from "../CloudWorkspaceRecordView";

const NOW_TICK_MS = 30_000;
const DESCRIPTION_WAIT_MS = 5 * 60_000;

interface CloudWorkspaceRecordScreenProps {
	workspaceId: string;
}

export function CloudWorkspaceRecordScreen({
	workspaceId,
}: CloudWorkspaceRecordScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const tick = useNow(NOW_TICK_MS);
	const now = new Date(Math.max(tick.getTime(), Date.now()));
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const setVisibility = useSetCloudWorkspaceVisibility();
	const unarchive = useUnarchiveCloudWorkspace();
	const copyShareLink = useCopyShareLink();
	const requestSaveAsEnvironment = useSaveAsEnvironmentIntent(
		(state) => state.request,
	);
	const { copyToClipboard } = useCopyToClipboard();
	const setInSidebar = useCloudSidebarStore((state) => state.setInSidebar);
	const { workspaces } = useCloudWorkspaces();
	const openPullRequest = useOpenPullRequestInApp();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const saveImageToDownloads = useSaveImageToDownloads();
	const utils = cloudTrpc.useUtils();
	const orgInput = { organizationId: organizationId ?? "" };
	const hasOrg = organizationId !== null;

	const record = cloudTrpc.cloudWorkspace.get.useQuery({ id: workspaceId });
	const activity = cloudTrpc.cloudWorkspace.activity.useQuery({
		id: workspaceId,
	});
	const suggestions = cloudTrpc.suggestion.listForCloudWorkspace.useQuery({
		cloudWorkspaceId: workspaceId,
	});
	const projects = cloudTrpc.taskProject.list.useQuery(orgInput, {
		enabled: hasOrg,
	});
	const labels = cloudTrpc.taskLabel.list.useQuery(orgInput, {
		enabled: hasOrg,
	});
	const pages = cloudTrpc.page.list.useQuery({ workspaceId });

	const {
		rename,
		setDescription,
		addLabel,
		removeLabel,
		setProject,
		unlinkTask,
		acceptSuggestion,
		dismissSuggestion,
	} = useCloudWorkspaceRecordMutations(workspaceId);
	const [newProjectName, setNewProjectName] = useState<string | null>(null);
	const { people, currentUserId } = useOrganizationPeople();
	const inviteMember = useInviteMember();
	const createProject = cloudTrpc.taskProject.create.useMutation({
		onSuccess: (project) => {
			void utils.taskProject.list.invalidate();
			setNewProjectName(null);
			if (project)
				setProject.mutate({ id: workspaceId, projectId: project.id });
		},
	});
	const generateDescription =
		cloudTrpc.cloudWorkspace.generateDescription.useMutation({
			onError: (error) =>
				toast.error(
					t({ message: "Couldn't ask the workspace for a description" }),
					{ description: errorMessage(error) },
				),
		});

	const data = record.data;
	const listed = workspaces?.find((row) => row.id === workspaceId);
	const refs = useMemo(
		() =>
			(data?.repositories ?? []).map((repository) => ({
				repoFullName: repository.fullName,
				headBranch: repository.branch,
			})),
		[data?.repositories],
	);
	const { byRef } = useCloudPullRequests(refs);
	const pullRequests = refs.flatMap((ref): CloudPullRequest[] => {
		const pullRequest = byRef.get(cloudPullRequestRefKey(ref));
		return pullRequest ? [pullRequest] : [];
	});

	const isGone =
		record.error instanceof TRPCClientError &&
		record.error.data?.code === "NOT_FOUND";
	if (isGone || (!data && record.error)) {
		return (
			<StateScreenShell>
				<WorkspaceNotFoundState
					workspaceId={workspaceId}
					browseTo="/cloud-workspaces"
				/>
			</StateScreenShell>
		);
	}
	if (!data) return <StateScreenShell />;

	const workspace: CloudWorkspaceRecord = {
		id: data.id,
		name: data.name,
		status: listed?.status ?? data.status,
		agentStatus: listed?.agentStatus ?? data.agentStatus,
		agentStatusAt: listed?.agentStatusAt ?? data.agentStatusAt,
		createdAt: data.createdAt,
		createdBy: data.createdBy,
		presence: listed?.presence ?? [],
		archivedAt: data.archivedAt,
		visibility: listed?.visibility ?? data.visibility,
		environmentName: data.environment?.name ?? "",
		repositories: data.repositories,
		prompt: data.prompt,
		description: data.description,
		labels: data.labels,
		project: data.project,
	};
	const pageRows = pages.data ?? [];
	const branch = data.repositories[0]?.branch;
	const copy = (text: string, success: string) =>
		toast.promise(copyToClipboard(text), {
			success,
			error: (error) => errorMessage(error),
		});
	const descriptionRequest = generateDescription.data;
	const isGeneratingDescription =
		generateDescription.isPending ||
		(descriptionRequest !== undefined &&
			data.description === descriptionRequest.previous &&
			now.getTime() - descriptionRequest.requestedAt.getTime() <
				DESCRIPTION_WAIT_MS);

	return (
		<>
			<CloudWorkspaceRecordView
				workspace={workspace}
				tasks={data.tasks}
				suggestions={suggestions.data ?? []}
				knownLabels={labels.data ?? []}
				pullRequests={pullRequests}
				pages={pageRows.map((page) => ({
					id: page.id,
					title: page.title,
					thumbnailUrl: page.thumbnailUrl,
					createdAt: page.createdAt,
					updatedAt: page.updatedAt,
				}))}
				projects={projects.data ?? []}
				attachments={data.attachments}
				timeline={toTimelineEntries(activity.data ?? [])}
				now={now}
				isGeneratingDescription={isGeneratingDescription}
				viewerId={session?.user?.id}
				canEditSharing={
					session?.user?.id !== undefined &&
					data.createdBy?.userId === session.user.id
				}
				onCopyLink={() => copyShareLink(`workspaces/${workspaceId}`)}
				onCopyId={() =>
					copy(workspaceId, t({ message: "Workspace ID copied" }))
				}
				onSaveAsEnvironment={
					workspace.status === "ready" && !workspace.archivedAt
						? () => requestSaveAsEnvironment(workspace.id)
						: undefined
				}
				onArchive={() =>
					useDeleteWorkspaceIntent.getState().request({
						workspaceId,
						workspaceName: workspace.name || (branch ?? ""),
					})
				}
				onUnarchive={() => unarchive(workspaceId)}
				onSetVisibility={(visibility) =>
					setVisibility.mutateAsync({ id: workspaceId, visibility })
				}
				onGenerateDescription={() =>
					generateDescription.mutate({ id: workspaceId })
				}
				onSaveDescription={(description) =>
					setDescription.mutate({
						id: workspaceId,
						description: description ?? "",
					})
				}
				onBack={() => void navigate({ to: "/cloud-workspaces" })}
				onOpenWorkspace={() => {
					if (organizationId) setInSidebar(organizationId, workspaceId, true);
					void navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId },
					});
				}}
				onRename={(name) => rename.mutate({ id: workspaceId, name })}
				onOpenPerson={(userId) =>
					void navigate({
						to: "/cloud-workspaces",
						search: { people: [userId] },
					})
				}
				onAddLabel={(name) => addLabel.mutate({ id: workspaceId, name })}
				onRemoveLabel={removeLabel}
				onSetProject={(projectId) =>
					setProject.mutate({ id: workspaceId, projectId })
				}
				onCreateProject={(name) => setNewProjectName(name)}
				onOpenEnvironment={() =>
					void navigate({ to: "/settings/environments" })
				}
				onOpenRepository={(fullName) =>
					openUrl.mutate(`https://github.com/${fullName}`)
				}
				onOpenTask={(taskId) =>
					void navigate({ to: "/tasks/$taskId", params: { taskId } })
				}
				onUnlinkTask={(taskId) =>
					unlinkTask.mutate({ id: workspaceId, taskId })
				}
				onAcceptSuggestion={(id) => acceptSuggestion.mutate({ id })}
				onDismissSuggestion={(id) => dismissSuggestion.mutate({ id })}
				onOpenPullRequest={openPullRequest}
				onOpenLabel={(labelId) =>
					void navigate({
						to: "/cloud-workspaces",
						search: { labels: [labelId] },
					})
				}
				onOpenProject={(projectId) =>
					void navigate({
						to: "/cloud-workspaces",
						search: { projects: [projectId] },
					})
				}
				onOpenPage={(pageId) => {
					const slug = pageRows.find((page) => page.id === pageId)?.slug;
					if (slug) void navigate({ to: "/pages/$slug", params: { slug } });
				}}
				onOpenAttachment={(attachmentId) => {
					const url = data.attachments.find((a) => a.id === attachmentId)?.url;
					if (url) openUrl.mutate(url);
				}}
				onDownloadAttachment={async (attachmentId) => {
					const attachment = data.attachments.find(
						(a) => a.id === attachmentId,
					);
					if (attachment) {
						await saveImageToDownloads(attachment.url, attachment.name);
					}
				}}
			/>
			<NewProjectDialog
				open={newProjectName !== null}
				initialName={newProjectName ?? ""}
				people={people}
				onInvite={inviteMember}
				defaultLeadId={currentUserId}
				isCreating={createProject.isPending}
				onOpenChange={(open) => {
					if (!open) setNewProjectName(null);
				}}
				onCreate={(project) => {
					if (organizationId) {
						createProject.mutate({ organizationId, ...project });
					}
				}}
			/>
		</>
	);
}
