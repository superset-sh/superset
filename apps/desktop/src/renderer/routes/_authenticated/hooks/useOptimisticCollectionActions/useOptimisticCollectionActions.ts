import type { TaskPriority, V2UsersHostRole } from "@superset/db/enums";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { isDesktopChatDevMode } from "renderer/lib/dev-chat";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type CollectionLike,
	updateCollectionItemSafely,
} from "./utils/updateCollectionItemSafely";

export type PersistableTransaction = {
	isPersisted: {
		promise: Promise<unknown>;
	};
};

interface V2ProjectPatch {
	name?: string;
	slug?: string;
	repoCloneUrl?: string | null;
	githubRepositoryId?: string | null;
}

interface V2WorkspacePatch {
	name?: string;
	branch?: string;
	hostId?: string;
	taskId?: string | null;
}

interface V2ProjectDraft {
	name: string;
	slug: string;
	repoCloneUrl: string | null;
	githubRepositoryId: string | null;
}

interface V2WorkspaceDraft {
	name: string;
	branch: string;
	hostId: string;
	taskId: string | null;
}

interface V2HostDraft {
	name: string;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === "string" && error.trim()) {
		return error;
	}

	return "The local change was rolled back.";
}

function useOptimisticMutationRunner() {
	const reportFailure = useCallback(
		(scope: string, title: string, error: unknown) => {
			console.error(`[${scope}] ${title}:`, error);
			toast.error(title, {
				description: getErrorMessage(error),
			});
		},
		[],
	);

	return useCallback(
		(
			scope: string,
			failureTitle: string,
			mutation: () => PersistableTransaction,
		): PersistableTransaction | null => {
			try {
				const transaction = mutation();

				void transaction.isPersisted.promise.catch((error) => {
					reportFailure(scope, failureTitle, error);
				});

				return transaction;
			} catch (error) {
				reportFailure(scope, failureTitle, error);
				return null;
			}
		},
		[reportFailure],
	);
}

export function useOptimisticCollectionActions() {
	const collections = useCollections();
	const runMutation = useOptimisticMutationRunner();

	return useMemo(() => {
		const runTaskMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.tasks", failureTitle, mutation);

		const runProjectMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.v2Projects", failureTitle, mutation);

		const runWorkspaceMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.v2Workspaces", failureTitle, mutation);

		const runChatSessionMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.chatSessions", failureTitle, mutation);

		const runUsersHostsMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.v2UsersHosts", failureTitle, mutation);

		const runHostsMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.v2Hosts", failureTitle, mutation);

		return {
			tasks: {
				updateTitle: (taskId: string, title: string) =>
					runTaskMutation("Failed to update task title", () =>
						collections.tasks.update(taskId, (draft) => {
							draft.title = title;
						}),
					),
				updateDescription: (taskId: string, description: string) =>
					runTaskMutation("Failed to update task description", () =>
						collections.tasks.update(taskId, (draft) => {
							draft.description = description;
						}),
					),
				updateStatus: (taskId: string, statusId: string) =>
					runTaskMutation("Failed to update task status", () =>
						collections.tasks.update(taskId, (draft) => {
							draft.statusId = statusId;
						}),
					),
				updatePriority: (taskId: string, priority: TaskPriority) =>
					runTaskMutation("Failed to update task priority", () =>
						collections.tasks.update(taskId, (draft) => {
							draft.priority = priority;
						}),
					),
				updateAssignee: (taskId: string, assigneeId: string | null) =>
					runTaskMutation("Failed to update task assignee", () =>
						collections.tasks.update(taskId, (draft) => {
							draft.assigneeId = assigneeId;
							draft.assigneeExternalId = null;
							draft.assigneeDisplayName = null;
							draft.assigneeAvatarUrl = null;
						}),
					),
				deleteTask: (taskId: string) =>
					runTaskMutation("Failed to delete task", () =>
						collections.tasks.delete(taskId),
					),
			},
			v2Projects: {
				updateProject: (projectId: string, patch: V2ProjectPatch) =>
					runProjectMutation("Failed to update project", () =>
						updateCollectionItemSafely({
							collection:
								collections.v2Projects as CollectionLike<V2ProjectDraft>,
							key: projectId,
							resourceLabel: "Project",
							mutate: (draft) => {
								if (patch.name !== undefined) {
									draft.name = patch.name;
								}
								if (patch.slug !== undefined) {
									draft.slug = patch.slug;
								}
								if (patch.repoCloneUrl !== undefined) {
									draft.repoCloneUrl = patch.repoCloneUrl;
								}
								if (patch.githubRepositoryId !== undefined) {
									draft.githubRepositoryId = patch.githubRepositoryId;
								}
							},
						}),
					),
				renameProject: (projectId: string, name: string) =>
					runProjectMutation("Failed to rename project", () =>
						updateCollectionItemSafely({
							collection:
								collections.v2Projects as CollectionLike<V2ProjectDraft>,
							key: projectId,
							resourceLabel: "Project",
							mutate: (draft) => {
								draft.name = name;
							},
						}),
					),
				updateRepository: (projectId: string, repoCloneUrl: string | null) =>
					runProjectMutation("Failed to update project repository", () =>
						updateCollectionItemSafely({
							collection:
								collections.v2Projects as CollectionLike<V2ProjectDraft>,
							key: projectId,
							resourceLabel: "Project",
							mutate: (draft) => {
								draft.repoCloneUrl = repoCloneUrl;
								draft.githubRepositoryId = null;
							},
						}),
					),
			},
			v2Workspaces: {
				updateWorkspace: (workspaceId: string, patch: V2WorkspacePatch) =>
					runWorkspaceMutation("Failed to update workspace", () =>
						updateCollectionItemSafely({
							collection:
								collections.v2Workspaces as CollectionLike<V2WorkspaceDraft>,
							key: workspaceId,
							resourceLabel: "Workspace",
							mutate: (draft) => {
								if (patch.name !== undefined) {
									draft.name = patch.name;
								}
								if (patch.branch !== undefined) {
									draft.branch = patch.branch;
								}
								if (patch.hostId !== undefined) {
									draft.hostId = patch.hostId;
								}
								if (patch.taskId !== undefined) {
									draft.taskId = patch.taskId;
								}
							},
						}),
					),
				renameWorkspace: (workspaceId: string, name: string) =>
					runWorkspaceMutation("Failed to rename workspace", () =>
						updateCollectionItemSafely({
							collection:
								collections.v2Workspaces as CollectionLike<V2WorkspaceDraft>,
							key: workspaceId,
							resourceLabel: "Workspace",
							mutate: (draft) => {
								draft.name = name;
							},
						}),
					),
			},
			chatSessions: {
				deleteSession: (sessionId: string) => {
					if (isDesktopChatDevMode()) return null;

					return runChatSessionMutation("Failed to delete chat session", () =>
						collections.chatSessions.delete(sessionId),
					);
				},
			},
			v2Hosts: {
				renameHost: (hostId: string, name: string) =>
					runHostsMutation("Failed to rename host", () =>
						updateCollectionItemSafely({
							collection: collections.v2Hosts as CollectionLike<V2HostDraft>,
							key: hostId,
							resourceLabel: "Host",
							mutate: (draft) => {
								draft.name = name;
							},
						}),
					),
			},
			v2UsersHosts: {
				addMember: (input: {
					hostId: string;
					userId: string;
					organizationId: string;
					role?: V2UsersHostRole;
				}) =>
					runUsersHostsMutation("Failed to add member", () => {
						const now = new Date();
						return collections.v2UsersHosts.insert({
							hostId: input.hostId,
							userId: input.userId,
							organizationId: input.organizationId,
							role: input.role ?? "member",
							createdAt: now,
							updatedAt: now,
						});
					}),
				removeMember: (rowKey: string) =>
					runUsersHostsMutation("Failed to remove member", () =>
						collections.v2UsersHosts.delete(rowKey),
					),
				setMemberRole: (rowKey: string, role: V2UsersHostRole) =>
					runUsersHostsMutation("Failed to update role", () =>
						collections.v2UsersHosts.update(rowKey, (draft) => {
							draft.role = role;
						}),
					),
			},
		};
	}, [collections, runMutation]);
}
