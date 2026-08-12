import type { TaskPriority, V2UsersHostRole } from "@superset/db/enums";
import type { RouterOutputs } from "@superset/trpc";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { isDesktopChatDevMode } from "renderer/lib/dev-chat";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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

interface V2WorkspacePatch {
	name?: string;
	branch?: string;
	taskId?: string | null;
}

type TaskListRow = RouterOutputs["task"]["list"][number];
type TaskRecord = TaskListRow["task"];
type TaskPatch = Partial<TaskRecord>;
type TaskRowPatch = Partial<Omit<TaskListRow, "task">>;
type TaskDetail = RouterOutputs["task"]["byIdOrSlug"] | null;
type TaskPage = RouterOutputs["task"]["listPage"];
type TaskPages = { pages: TaskPage[]; pageParams: unknown[] };

/**
 * The pending-rename UI tracks transaction-shaped objects; wrap the mutate
 * promise in one.
 */
function makeTransaction(
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

function parseUsersHostsKey(rowKey: string): {
	userId: string;
	hostId: string;
} {
	const separatorIndex = rowKey.indexOf(":");
	const userId = rowKey.slice(0, separatorIndex);
	const hostId = rowKey.slice(separatorIndex + 1);
	if (separatorIndex === -1 || !userId || !hostId) {
		throw new Error("Invalid host membership key");
	}
	return { userId, hostId };
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

function useTaskCachePatcher() {
	const queryClient = useQueryClient();

	return useCallback(
		(
			taskId: string,
			apply: {
				row: (row: TaskListRow) => TaskListRow | null;
				detail: (task: NonNullable<TaskDetail>) => TaskDetail;
			},
		) => {
			const listKey = getQueryKey(cloudTrpc.task.list);
			const pageKey = getQueryKey(cloudTrpc.task.listPage);
			const detailKeys = [
				getQueryKey(cloudTrpc.task.byId),
				getQueryKey(cloudTrpc.task.bySlug),
				getQueryKey(cloudTrpc.task.byIdOrSlug),
			];

			// An in-flight refetch would otherwise land after the patch and
			// overwrite it with pre-mutation rows.
			for (const queryKey of [listKey, pageKey, ...detailKeys]) {
				void queryClient.cancelQueries({ queryKey });
			}

			const patchRows = (rows: TaskListRow[]) =>
				rows.flatMap((row) => {
					if (row.task.id !== taskId) return [row];
					const next = apply.row(row);
					return next ? [next] : [];
				});

			const previousLists = queryClient.getQueriesData<TaskListRow[]>({
				queryKey: listKey,
			});
			const previousPages = queryClient.getQueriesData<TaskPage | TaskPages>({
				queryKey: pageKey,
			});
			const previousDetails = detailKeys.flatMap((queryKey) =>
				queryClient.getQueriesData<TaskDetail>({ queryKey }),
			);

			queryClient.setQueriesData<TaskListRow[]>(
				{ queryKey: listKey },
				(rows) => (rows ? patchRows(rows) : rows),
			);

			queryClient.setQueriesData<TaskPage | TaskPages>(
				{ queryKey: pageKey },
				(data) => {
					if (!data) return data;
					if ("pages" in data) {
						return {
							...data,
							pages: data.pages.map((page) => ({
								...page,
								items: patchRows(page.items),
							})),
						};
					}
					return { ...data, items: patchRows(data.items) };
				},
			);

			for (const queryKey of detailKeys) {
				queryClient.setQueriesData<TaskDetail>({ queryKey }, (task) =>
					task && task.id === taskId ? apply.detail(task) : task,
				);
			}

			return () => {
				for (const [queryKey, rows] of previousLists) {
					queryClient.setQueryData(queryKey, rows);
				}
				for (const [queryKey, pages] of previousPages) {
					queryClient.setQueryData(queryKey, pages);
				}
				for (const [queryKey, task] of previousDetails) {
					queryClient.setQueryData(queryKey, task);
				}
			};
		},
		[queryClient],
	);
}

export function useOptimisticActions() {
	const { workspaces: hostWorkspaces, cache: hostWorkspacesCache } =
		useHostWorkspaces();
	const runMutation = useOptimisticMutationRunner();
	const patchTaskCaches = useTaskCachePatcher();
	const utils = cloudTrpc.useUtils();
	const trackWorkspaceTransaction = useWorkspaceTransactionsStore(
		(state) => state.track,
	);

	return useMemo(() => {
		const runTaskMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.tasks", failureTitle, mutation);

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

		const updateTask = (
			taskId: string,
			patch: TaskPatch,
			rowPatch?: TaskRowPatch,
		) => {
			const rollback = patchTaskCaches(taskId, {
				row: (row) => ({
					...row,
					...rowPatch,
					task: { ...row.task, ...patch },
				}),
				detail: (task) => ({ ...task, ...patch }),
			});

			const promise = apiTrpcClient.task.update
				.mutate({ id: taskId, ...patch })
				.catch((error: unknown) => {
					rollback();
					throw error;
				})
				.finally(() => {
					void utils.task.invalidate();
				});

			return makeTransaction("update", promise);
		};

		const trackedWorkspaceWrite = (
			failureTitle: string,
			workspaceId: string,
			patch: V2WorkspacePatch,
		) => {
			const transaction = runWorkspaceMutation(failureTitle, () => {
				const workspace = hostWorkspaces.find(
					(item) => item.id === workspaceId,
				);
				if (!workspace) {
					throw new Error("Workspace not found");
				}
				const hostUrl = hostWorkspacesCache.resolveHostUrl(workspace.hostId);
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
				return makeTransaction("update", promise);
			});
			if (transaction) {
				trackWorkspaceTransaction(workspaceId, transaction);
			}
			return transaction;
		};

		return {
			tasks: {
				updateTitle: (taskId: string, title: string) =>
					runTaskMutation("Failed to update task title", () =>
						updateTask(taskId, { title }),
					),
				updateDescription: (taskId: string, description: string) =>
					runTaskMutation("Failed to update task description", () =>
						updateTask(taskId, { description }),
					),
				updateStatus: (taskId: string, statusId: string) =>
					runTaskMutation("Failed to update task status", () => {
						const statusName = utils.task.statuses.list
							.getData()
							?.find((status) => status.id === statusId)?.name;
						return updateTask(
							taskId,
							{ statusId },
							statusName === undefined ? undefined : { statusName },
						);
					}),
				updatePriority: (taskId: string, priority: TaskPriority) =>
					runTaskMutation("Failed to update task priority", () =>
						updateTask(taskId, { priority }),
					),
				updateAssignee: (taskId: string, assigneeId: string | null) =>
					runTaskMutation("Failed to update task assignee", () => {
						const member = assigneeId
							? utils.organization.listMembers
									.getData()
									?.find((entry) => entry.user.id === assigneeId)
							: undefined;
						return updateTask(
							taskId,
							{
								assigneeId,
								assigneeExternalId: null,
								assigneeDisplayName: null,
								assigneeAvatarUrl: null,
							},
							{
								assignee: member
									? {
											id: member.user.id,
											name: member.user.name,
											image: member.user.image,
										}
									: null,
							},
						);
					}),
				deleteTask: (taskId: string) =>
					runTaskMutation("Failed to delete task", () => {
						const rollback = patchTaskCaches(taskId, {
							row: () => null,
							detail: () => null,
						});

						const promise = apiTrpcClient.task.delete
							.mutate(taskId)
							.catch((error: unknown) => {
								rollback();
								throw error;
							})
							.finally(() => {
								void utils.task.invalidate();
							});

						return makeTransaction("delete", promise);
					}),
			},
			v2Workspaces: {
				// Workspace records are host-owned: the write goes to the owning
				// host, the cache is patched optimistically, and the host's
				// workspace:changed broadcast (or a rollback refetch) converges it.
				updateWorkspace: (workspaceId: string, patch: V2WorkspacePatch) =>
					trackedWorkspaceWrite(
						"Failed to update workspace",
						workspaceId,
						patch,
					),
				renameWorkspace: (workspaceId: string, name: string) =>
					trackedWorkspaceWrite("Failed to rename workspace", workspaceId, {
						name,
					}),
			},
			chatSessions: {
				deleteSession: (sessionId: string) => {
					if (isDesktopChatDevMode()) return null;

					return runChatSessionMutation("Failed to delete chat session", () => {
						const promise = apiTrpcClient.chat.deleteSession
							.mutate({ sessionId })
							.then((result) => {
								if (!result.deleted) {
									throw new Error("Chat session was not deleted");
								}
								return result;
							})
							.finally(() => {
								void utils.chat.listSessions.invalidate();
							});

						return makeTransaction("delete", promise);
					});
				},
			},
			v2Hosts: {
				deleteHost: (hostId: string) =>
					runHostsMutation("Failed to delete host", () =>
						makeTransaction(
							"delete",
							apiTrpcClient.v2Host.delete.mutate({ hostId }).finally(() => {
								void utils.v2Host.invalidate();
							}),
						),
					),
				renameHost: (hostId: string, name: string) =>
					runHostsMutation("Failed to rename host", () =>
						makeTransaction(
							"update",
							apiTrpcClient.v2Host.rename
								.mutate({ hostId, name })
								.finally(() => {
									void utils.v2Host.invalidate();
								}),
						),
					),
			},
			v2UsersHosts: {
				addMember: (input: {
					hostId: string;
					userId: string;
					organizationId: string;
					role?: V2UsersHostRole;
				}) =>
					runUsersHostsMutation("Failed to add member", () =>
						makeTransaction(
							"insert",
							apiTrpcClient.v2Host.addMember
								.mutate({
									hostId: input.hostId,
									userId: input.userId,
									role: input.role ?? "member",
								})
								.finally(() => {
									void utils.v2Host.invalidate();
								}),
						),
					),
				removeMember: (rowKey: string) =>
					runUsersHostsMutation("Failed to remove member", () => {
						const { userId, hostId } = parseUsersHostsKey(rowKey);
						return makeTransaction(
							"delete",
							apiTrpcClient.v2Host.removeMember
								.mutate({ hostId, userId })
								.finally(() => {
									void utils.v2Host.invalidate();
								}),
						);
					}),
				setMemberRole: (rowKey: string, role: V2UsersHostRole) =>
					runUsersHostsMutation("Failed to update role", () => {
						const { userId, hostId } = parseUsersHostsKey(rowKey);
						return makeTransaction(
							"update",
							apiTrpcClient.v2Host.setMemberRole
								.mutate({ hostId, userId, role })
								.finally(() => {
									void utils.v2Host.invalidate();
								}),
						);
					}),
			},
		};
	}, [
		hostWorkspaces,
		hostWorkspacesCache,
		patchTaskCaches,
		runMutation,
		trackWorkspaceTransaction,
		utils,
	]);
}
