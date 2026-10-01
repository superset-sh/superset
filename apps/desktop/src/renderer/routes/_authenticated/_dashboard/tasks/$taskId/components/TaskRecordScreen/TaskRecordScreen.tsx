import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useNow } from "renderer/hooks/useNow";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { NewProjectDialog } from "renderer/routes/_authenticated/_dashboard/components/NewProjectDialog";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { useCloudWorkspaceListItems } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceListItems";
import { useCopyShareLink } from "renderer/routes/_authenticated/_dashboard/hooks/useCopyShareLink";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { TASK_LIST_REFETCH_INTERVAL } from "../../../components/TasksView/hooks/useTasksData";
import { useTaskLabelMutations } from "../../hooks/useTaskLabelMutations";
import type {
	NewTaskComment,
	TaskProjectValue,
	TaskRecord,
	TaskTimeline,
} from "../../types";
import { toTaskTimeline } from "../../utils/toTaskTimeline";
import { TaskRecordView } from "../TaskRecordView";

const NOW_TICK_MS = 30_000;

interface TaskRecordScreenProps {
	taskId: string;
	onBack: () => void;
	onOpenAssignee: (userId: string) => void;
}

export function TaskRecordScreen({
	taskId,
	onBack,
	onOpenAssignee,
}: TaskRecordScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const tick = useNow(NOW_TICK_MS);
	const now = new Date(Math.max(tick.getTime(), Date.now()));
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const currentUser = session?.user ?? null;
	const { tasks: taskActions } = useOptimisticActions();
	const { copyToClipboard } = useCopyToClipboard();
	const copyShareLink = useCopyShareLink();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { people, currentUserId } = useOrganizationPeople();
	const inviteMember = useInviteMember();
	const [newProjectName, setNewProjectName] = useState<string | null>(null);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

	const { data: taskRecord, isPending: isTaskPending } =
		cloudTrpc.task.byIdOrSlug.useQuery(taskId, {
			refetchInterval: TASK_LIST_REFETCH_INTERVAL,
			retry: false,
		});
	const { data: statuses, isPending: areStatusesPending } =
		cloudTrpc.task.statuses.list.useQuery(undefined, {
			refetchInterval: TASK_LIST_REFETCH_INTERVAL,
		});
	const { data: members } = cloudTrpc.organization.listMembers.useQuery();

	const task: TaskRecord | null = useMemo(() => {
		if (!taskRecord) return null;
		const status = statuses?.find((entry) => entry.id === taskRecord.statusId);
		if (!status) return null;
		const findMember = (userId: string | null) =>
			userId
				? (members?.find((member) => member.user.id === userId)?.user ?? null)
				: null;
		return {
			...taskRecord,
			status,
			assignee: findMember(taskRecord.assigneeId),
			creator: findMember(taskRecord.creatorId),
		};
	}, [taskRecord, statuses, members]);

	const recordKey = { taskId: task?.id ?? "" };
	const timelineQuery = cloudTrpc.taskRecord.timeline.useQuery(recordKey, {
		enabled: task !== null,
		refetchInterval: TASK_LIST_REFETCH_INTERVAL,
	});
	const timeline = useMemo(
		() => (timelineQuery.data ? toTaskTimeline(timelineQuery.data) : []),
		[timelineQuery.data],
	);
	const updatedAt = task?.updatedAt?.valueOf();
	useEffect(() => {
		if (updatedAt) void utils.taskRecord.timeline.invalidate();
	}, [updatedAt, utils]);

	const { data: labels = [] } = cloudTrpc.taskRecord.labels.useQuery(
		recordKey,
		{ enabled: task !== null },
	);
	const { data: knownLabels = [] } = cloudTrpc.taskLabel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: Boolean(organizationId) },
	);
	const { addLabel, removeLabel } = useTaskLabelMutations(task?.id ?? "");
	const { data: project = null } = cloudTrpc.taskRecord.project.useQuery(
		recordKey,
		{ enabled: task !== null },
	);
	const { data: projects = [] } = cloudTrpc.taskProject.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);

	const { workspaces: allWorkspaces = [] } = useCloudWorkspaces();
	const { data: taskLinks } = cloudTrpc.cloudWorkspace.tasks.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const workspaces = useMemo(() => {
		const linkedIds = new Set(
			(taskLinks ?? [])
				.filter((link) => link.task.id === task?.id)
				.map((link) => link.cloudWorkspaceId),
		);
		return allWorkspaces.filter((workspace) => linkedIds.has(workspace.id));
	}, [taskLinks, allWorkspaces, task?.id]);
	const listItems = useCloudWorkspaceListItems(workspaces);
	const pullRequests = [
		...new Map(
			workspaces
				.flatMap((workspace) => listItems.toItem(workspace).pullRequests)
				.map((pullRequest) => [pullRequest.url, pullRequest] as const),
		).values(),
	];

	const fail = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);

	const setProjectFor = async (
		projectId: string | null,
		created?: TaskProjectValue,
	) => {
		if (!task) return;
		await utils.taskRecord.project.cancel(recordKey);
		const previous = utils.taskRecord.project.getData(recordKey);
		const next: TaskProjectValue | null = projectId
			? (created ?? projects.find((option) => option.id === projectId) ?? null)
			: null;
		utils.taskRecord.project.setData(recordKey, () => next);
		try {
			if (projectId) {
				await utils.client.taskProject.addTask.mutate({
					id: projectId,
					taskId: task.id,
				});
			} else if (previous) {
				await utils.client.taskProject.removeTask.mutate({
					id: previous.id,
					taskId: task.id,
				});
			}
		} catch (error) {
			utils.taskRecord.project.setData(recordKey, () => previous);
			fail(error);
		} finally {
			void utils.taskRecord.project.invalidate(recordKey);
			void utils.taskRecord.timeline.invalidate(recordKey);
			void utils.taskProject.list.invalidate();
		}
	};

	const createProject = cloudTrpc.taskProject.create.useMutation({
		onSuccess: (created) => {
			void utils.taskProject.list.invalidate();
			setNewProjectName(null);
			if (created) void setProjectFor(created.id, created);
		},
		onError: fail,
	});

	const addComment = async (comment: NewTaskComment) => {
		if (!task) return;
		await utils.taskRecord.timeline.cancel(recordKey);
		const previous = utils.taskRecord.timeline.getData(recordKey);
		if (previous && currentUser) {
			const pending: TaskTimeline["comments"][number] = {
				id: `pending:${crypto.randomUUID()}`,
				at: new Date(),
				editedAt: null,
				parentCommentId: comment.parentCommentId ?? null,
				body: comment.body,
				author: {
					userId: currentUser.id,
					name: currentUser.name,
					image: currentUser.image ?? null,
				},
			};
			utils.taskRecord.timeline.setData(recordKey, {
				...previous,
				comments: [...previous.comments, pending],
			});
		}
		try {
			await utils.client.taskRecord.addComment.mutate({
				taskId: task.id,
				body: comment.body,
				parentCommentId: comment.parentCommentId,
			});
		} catch (error) {
			if (previous) utils.taskRecord.timeline.setData(recordKey, previous);
			fail(error);
			throw error;
		} finally {
			void utils.taskRecord.timeline.invalidate(recordKey);
		}
	};

	const patchComment = async (
		commentId: string,
		patch: Partial<TaskTimeline["comments"][number]>,
	) => {
		await utils.taskRecord.timeline.cancel(recordKey);
		const previous = utils.taskRecord.timeline.getData(recordKey);
		if (previous) {
			utils.taskRecord.timeline.setData(recordKey, {
				...previous,
				comments: previous.comments.map((comment) =>
					comment.id === commentId ? { ...comment, ...patch } : comment,
				),
			});
		}
		return previous;
	};

	const removeComment = async (commentId: string) => {
		await utils.taskRecord.timeline.cancel(recordKey);
		const previous = utils.taskRecord.timeline.getData(recordKey);
		if (previous) {
			utils.taskRecord.timeline.setData(recordKey, {
				...previous,
				comments: previous.comments.filter(
					(comment) =>
						comment.id !== commentId && comment.parentCommentId !== commentId,
				),
			});
		}
		return previous;
	};

	if (!task) {
		if (isTaskPending || areStatusesPending) return <StateScreenShell />;
		return (
			<StateScreenShell>
				<div className="flex h-full items-center justify-center">
					<span className="text-muted-foreground">
						<Trans>Task not found</Trans>
					</span>
				</div>
			</StateScreenShell>
		);
	}

	return (
		<>
			<TaskRecordView
				task={task}
				now={now}
				timeline={timeline}
				currentUser={
					currentUser
						? {
								userId: currentUser.id,
								name: currentUser.name,
								image: currentUser.image ?? null,
							}
						: null
				}
				project={project}
				projects={projects}
				workspaces={workspaces}
				pullRequests={pullRequests}
				labels={labels}
				knownLabels={knownLabels}
				onAddLabel={(name) => addLabel.mutate({ taskId: task.id, name })}
				onRemoveLabel={removeLabel}
				onBack={onBack}
				onRename={(title) => taskActions.updateTitle(task.id, title)}
				onSaveDescription={(description) =>
					taskActions.updateDescription(task.id, description ?? "")
				}
				onCopyLink={() => copyShareLink(`tasks/${task.slug}`)}
				onCopyId={() =>
					toast.promise(copyToClipboard(task.slug), {
						success: t({ message: "Task ID copied" }),
						error: (error) => errorMessage(error),
					})
				}
				onOpenExternal={
					task.externalUrl
						? () => task.externalUrl && openUrl.mutate(task.externalUrl)
						: undefined
				}
				onDelete={() => setIsConfirmingDelete(true)}
				onSetProject={(projectId) => void setProjectFor(projectId)}
				onCreateProject={setNewProjectName}
				onOpenPerson={onOpenAssignee}
				onOpenProject={(projectId) =>
					void navigate({ to: "/projects/$projectId", params: { projectId } })
				}
				onOpenWorkspace={(workspaceId) =>
					void navigate({
						to: "/cloud-workspaces/$workspaceId",
						params: { workspaceId },
					})
				}
				onOpenPullRequest={listItems.onOpenPullRequest}
				onAddComment={addComment}
				onEditComment={async (commentId, body) => {
					const previous = await patchComment(commentId, {
						body,
						editedAt: new Date(),
					});
					try {
						await utils.client.taskRecord.editComment.mutate({
							id: commentId,
							body,
						});
					} catch (error) {
						if (previous)
							utils.taskRecord.timeline.setData(recordKey, previous);
						fail(error);
						throw error;
					} finally {
						void utils.taskRecord.timeline.invalidate(recordKey);
					}
				}}
				onDeleteComment={async (commentId) => {
					const previous = await removeComment(commentId);
					try {
						await utils.client.taskRecord.deleteComment.mutate({
							id: commentId,
						});
					} catch (error) {
						if (previous)
							utils.taskRecord.timeline.setData(recordKey, previous);
						fail(error);
					} finally {
						void utils.taskRecord.timeline.invalidate(recordKey);
					}
				}}
			/>
			<DiscardConfirmDialog
				open={isConfirmingDelete}
				onOpenChange={setIsConfirmingDelete}
				title={t({ message: "Delete this task?" })}
				description={t({
					message: "Its comments and history go with it.",
				})}
				confirmLabel={t({ message: "Delete" })}
				onConfirm={() => {
					setIsConfirmingDelete(false);
					if (taskActions.deleteTask(task.id)) onBack();
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
				onCreate={(created) => {
					if (organizationId) {
						createProject.mutate({ organizationId, ...created });
					}
				}}
			/>
		</>
	);
}
