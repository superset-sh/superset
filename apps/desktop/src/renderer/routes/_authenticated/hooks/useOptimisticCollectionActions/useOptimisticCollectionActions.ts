import type { TaskPriority, V2UsersHostRole } from "@superset/db/enums";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { isDesktopChatDevMode } from "renderer/lib/dev-chat";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type TrackableWorkspaceTransactionState,
	useWorkspaceTransactionsStore,
	type WorkspaceTransactionType,
} from "renderer/stores/workspace-creates";

export type PersistableTransaction = {
	id: string;
	state: TrackableWorkspaceTransactionState;
	createdAt: Date;
	mutations: Array<{ type: WorkspaceTransactionType }>;
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
	taskId?: string | null;
}

/**
 * Host workspace writes aren't collection transactions, but the pending-
 * rename UI tracks transaction-shaped objects; wrap the host mutate
 * promise in one.
 */
function makeHostWorkspaceTransaction(
	type: WorkspaceTransactionType,
	promise: Promise<unknown>,
): PersistableTransaction {
	return {
		id: crypto.randomUUID(),
		state: "persisting",
		createdAt: new Date(),
		mutations: [{ type }],
		isPersisted: { promise },
	};
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
	const { workspaces: hostWorkspaces, cache: hostWorkspacesCache } =
		useHostWorkspaces();
	const runMutation = useOptimisticMutationRunner();
	const trackWorkspaceTransaction = useWorkspaceTransactionsStore(
		(state) => state.track,
	);

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
						collections.v2Projects.update(projectId, (draft) => {
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
						}),
					),
				renameProject: (projectId: string, name: string) =>
					runProjectMutation("Failed to rename project", () =>
						collections.v2Projects.update(projectId, (draft) => {
							draft.name = name;
						}),
					),
				updateRepository: (projectId: string, repoCloneUrl: string | null) =>
					runProjectMutation("Failed to update project repository", () =>
						collections.v2Projects.update(projectId, (draft) => {
							draft.repoCloneUrl = repoCloneUrl;
							draft.githubRepositoryId = null;
						}),
					),
			},
			v2Workspaces: {
				// Workspace records are host-owned: the write goes to the owning
				// host, the cache is patched optimistically, and the host's
				// workspace:changed broadcast (or a rollback refetch) converges it.
				updateWorkspace: (workspaceId: string, patch: V2WorkspacePatch) => {
					const transaction = runWorkspaceMutation(
						"Failed to update workspace",
						() => {
							const workspace = hostWorkspaces.find(
								(item) => item.id === workspaceId,
							);
							if (!workspace) {
								throw new Error("Workspace not found");
							}
							const hostUrl = hostWorkspacesCache.resolveHostUrl(
								workspace.hostId,
							);
							if (!hostUrl) {
								throw new Error(
									"The workspace's host is offline — try again when it reconnects.",
								);
							}
							hostWorkspacesCache.upsertWorkspace({
								...workspace,
								...patch,
								worktreePath: workspace.worktreePath ?? "",
								worktreeExists: workspace.worktreeExists ?? true,
								updatedAt: new Date(),
							});
							const promise = getHostServiceClientByUrl(hostUrl)
								.workspace.update.mutate({
									id: workspaceId,
									name: patch.name,
									branch: patch.branch,
									taskId: patch.taskId,
								})
								.catch((error: unknown) => {
									hostWorkspacesCache.invalidateHost(workspace.hostId);
									throw error;
								});
							return makeHostWorkspaceTransaction("update", promise);
						},
					);
					if (transaction) {
						trackWorkspaceTransaction(workspaceId, transaction);
					}
					return transaction;
				},
				renameWorkspace: (workspaceId: string, name: string) => {
					const transaction = runWorkspaceMutation(
						"Failed to rename workspace",
						() => {
							const workspace = hostWorkspaces.find(
								(item) => item.id === workspaceId,
							);
							if (!workspace) {
								throw new Error("Workspace not found");
							}
							const hostUrl = hostWorkspacesCache.resolveHostUrl(
								workspace.hostId,
							);
							if (!hostUrl) {
								throw new Error(
									"The workspace's host is offline — try again when it reconnects.",
								);
							}
							hostWorkspacesCache.upsertWorkspace({
								...workspace,
								name,
								worktreePath: workspace.worktreePath ?? "",
								worktreeExists: workspace.worktreeExists ?? true,
								updatedAt: new Date(),
							});
							const promise = getHostServiceClientByUrl(hostUrl)
								.workspace.update.mutate({ id: workspaceId, name })
								.catch((error: unknown) => {
									hostWorkspacesCache.invalidateHost(workspace.hostId);
									throw error;
								});
							return makeHostWorkspaceTransaction("update", promise);
						},
					);
					if (transaction) {
						trackWorkspaceTransaction(workspaceId, transaction);
					}
					return transaction;
				},
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
				deleteHost: (hostId: string) =>
					runHostsMutation("Failed to delete host", () =>
						collections.v2Hosts.delete(hostId),
					),
				renameHost: (hostId: string, name: string) =>
					runHostsMutation("Failed to rename host", () =>
						collections.v2Hosts.update(hostId, (draft) => {
							draft.name = name;
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
	}, [
		collections,
		hostWorkspaces,
		hostWorkspacesCache,
		runMutation,
		trackWorkspaceTransaction,
	]);
}
