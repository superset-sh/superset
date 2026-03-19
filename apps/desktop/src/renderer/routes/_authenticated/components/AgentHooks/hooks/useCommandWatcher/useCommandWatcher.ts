import { FEATURE_FLAGS } from "@superset/shared/constants";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces/useCreateWorkspace";
import { useDeleteWorkspace } from "renderer/react-query/workspaces/useDeleteWorkspace";
import { useUpdateWorkspace } from "renderer/react-query/workspaces/useUpdateWorkspace";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { executeTool, type ToolContext } from "./tools";

const COMMAND_PERSIST_RETRY_MS = 1_000;

interface ResolvedCommandState {
	status: "completed" | "failed" | "timeout";
	result?: Record<string, unknown>;
	error?: string;
	executedAt?: Date;
}

export function useCommandWatcher() {
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const isMountedRef = useRef(true);
	const handledCommandsRef = useRef(new Set<string>());
	const processingCommandsRef = useRef(new Set<string>());
	const persistingCommandsRef = useRef(new Set<string>());
	const pendingPersistenceRef = useRef(new Map<string, ResolvedCommandState>());
	const persistenceRetryTimersRef = useRef(
		new Map<string, ReturnType<typeof setTimeout>>(),
	);

	const organizationId = session?.session?.activeOrganizationId;
	const remoteAgentDisabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.DISABLE_REMOTE_AGENT,
	);
	const shouldWatch = !!deviceInfo && !!organizationId && !remoteAgentDisabled;

	const createWorktree = useCreateWorkspace({ skipNavigation: true });
	const setActive = electronTrpc.workspaces.setActive.useMutation();
	const deleteWorkspace = useDeleteWorkspace();
	const updateWorkspace = useUpdateWorkspace();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();

	const { data: workspaces, refetch: refetchWorkspaces } =
		electronTrpc.workspaces.getAll.useQuery();
	const { data: workspaceGroups } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const { data: projects } = electronTrpc.projects.getRecents.useQuery();
	const worktreePathByWorkspaceId = useMemo(() => {
		const pathByWorkspaceId = new Map<string, string>();

		for (const group of workspaceGroups ?? []) {
			for (const workspace of group.workspaces) {
				pathByWorkspaceId.set(workspace.id, workspace.worktreePath);
			}

			for (const section of group.sections) {
				for (const workspace of section.workspaces) {
					pathByWorkspaceId.set(workspace.id, workspace.worktreePath);
				}
			}
		}

		return pathByWorkspaceId;
	}, [workspaceGroups]);

	const getCurrentWorkspaceIdFromRoute = useCallback(() => {
		const hash = window.location.hash;
		const pathname = hash.startsWith("#") ? hash.slice(1) : hash;
		const match = pathname.match(/\/workspace\/([^/]+)/);
		return match ? match[1] : null;
	}, []);

	const toolContext: ToolContext = useMemo(
		() => ({
			createWorktree,
			setActive,
			deleteWorkspace,
			updateWorkspace,
			terminalCreateOrAttach,
			terminalWrite,
			refetchWorkspaces: async () => refetchWorkspaces(),
			getWorkspaces: () => workspaces,
			getProjects: () => projects,
			getActiveWorkspaceId: getCurrentWorkspaceIdFromRoute,
			getWorktreePathByWorkspaceId: (workspaceId) =>
				worktreePathByWorkspaceId.get(workspaceId),
		}),
		[
			createWorktree,
			setActive,
			deleteWorkspace,
			updateWorkspace,
			terminalCreateOrAttach,
			terminalWrite,
			refetchWorkspaces,
			workspaces,
			projects,
			getCurrentWorkspaceIdFromRoute,
			worktreePathByWorkspaceId,
		],
	);

	const { data: pendingCommands } = useLiveQuery(
		(q) =>
			q
				.from({ commands: collections.agentCommands })
				.where(({ commands }) => eq(commands.status, "pending"))
				.select(({ commands }) => ({ ...commands })),
		[collections.agentCommands],
	);

	const persistResolvedCommand = useCallback(
		async (commandId: string) => {
			if (!isMountedRef.current) return;

			const resolved = pendingPersistenceRef.current.get(commandId);
			if (!resolved || persistingCommandsRef.current.has(commandId)) return;

			const existingRetryTimer =
				persistenceRetryTimersRef.current.get(commandId);
			if (existingRetryTimer) {
				clearTimeout(existingRetryTimer);
				persistenceRetryTimersRef.current.delete(commandId);
			}

			persistingCommandsRef.current.add(commandId);

			try {
				const tx = collections.agentCommands.update(commandId, (draft) => {
					draft.status = resolved.status;
					draft.result = resolved.result ?? null;
					draft.error = resolved.error ?? null;
					draft.executedAt = resolved.executedAt ?? null;
				});
				await tx.isPersisted.promise;
				pendingPersistenceRef.current.delete(commandId);
			} catch (error) {
				console.error(
					`[command-watcher] Failed to persist ${resolved.status}: ${commandId}`,
					error,
				);

				if (
					isMountedRef.current &&
					!persistenceRetryTimersRef.current.has(commandId)
				) {
					const retryTimer = setTimeout(() => {
						persistenceRetryTimersRef.current.delete(commandId);
						void persistResolvedCommand(commandId);
					}, COMMAND_PERSIST_RETRY_MS);
					persistenceRetryTimersRef.current.set(commandId, retryTimer);
				}
			} finally {
				persistingCommandsRef.current.delete(commandId);
			}
		},
		[collections.agentCommands],
	);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			for (const timer of persistenceRetryTimersRef.current.values()) {
				clearTimeout(timer);
			}
			persistenceRetryTimersRef.current.clear();
		};
	}, []);

	const processCommand = useCallback(
		async (
			commandId: string,
			tool: string,
			params: Record<string, unknown> | null,
		) => {
			if (
				handledCommandsRef.current.has(commandId) ||
				processingCommandsRef.current.has(commandId)
			) {
				if (pendingPersistenceRef.current.has(commandId)) {
					void persistResolvedCommand(commandId);
				}
				return;
			}

			processingCommandsRef.current.add(commandId);
			console.log(`[command-watcher] Processing: ${commandId} (${tool})`);

			let resolvedState: ResolvedCommandState;
			try {
				const result = await executeTool(tool, params, toolContext);

				if (result.success) {
					resolvedState = {
						status: "completed",
						result: result.data ?? {},
						executedAt: new Date(),
					};
				} else {
					const itemErrors = (
						result.data?.errors as Array<{ error: string }> | undefined
					)
						?.map((e) => e.error)
						.join("; ");
					const fullError = itemErrors
						? `${result.error ?? "Unknown error"}: ${itemErrors}`
						: (result.error ?? "Unknown error");

					resolvedState = {
						status: "failed",
						error: fullError,
						executedAt: new Date(),
					};
					console.error(
						`[command-watcher] Failed: ${commandId}`,
						fullError,
						result.data,
					);
				}
			} catch (error) {
				console.error(`[command-watcher] Error: ${commandId}`, error);
				const errorMsg =
					error instanceof Error ? error.message : "Execution error";
				resolvedState = {
					status: "failed",
					error: errorMsg,
					executedAt: new Date(),
				};
			} finally {
				processingCommandsRef.current.delete(commandId);
			}

			handledCommandsRef.current.add(commandId);
			pendingPersistenceRef.current.set(commandId, resolvedState);
			void persistResolvedCommand(commandId);
		},
		[persistResolvedCommand, toolContext],
	);

	useEffect(() => {
		if (
			!shouldWatch ||
			!deviceInfo?.deviceId ||
			!pendingCommands ||
			!organizationId
		) {
			return;
		}

		const now = new Date();
		const handledCommands = handledCommandsRef.current;
		const processingCommands = processingCommandsRef.current;

		// Expire timed-out commands before filtering for execution
		for (const cmd of pendingCommands) {
			if (cmd.targetDeviceId !== deviceInfo.deviceId) continue;
			if (cmd.organizationId !== organizationId) continue;
			if (processingCommands.has(cmd.id)) continue;
			if (handledCommands.has(cmd.id)) {
				if (pendingPersistenceRef.current.has(cmd.id)) {
					void persistResolvedCommand(cmd.id);
				}
				continue;
			}
			if (cmd.timeoutAt && new Date(cmd.timeoutAt) < now) {
				handledCommands.add(cmd.id);
				pendingPersistenceRef.current.set(cmd.id, {
					status: "timeout",
					error: "Command expired before execution",
				});
				void persistResolvedCommand(cmd.id);
			}
		}

		const commandsForThisDevice = pendingCommands.filter((cmd) => {
			if (cmd.targetDeviceId !== deviceInfo.deviceId) return false;
			if (processingCommands.has(cmd.id)) return false;
			if (handledCommands.has(cmd.id)) {
				if (pendingPersistenceRef.current.has(cmd.id)) {
					void persistResolvedCommand(cmd.id);
				}
				return false;
			}

			// Security: verify org matches (don't trust Electric filtering alone)
			if (cmd.organizationId !== organizationId) {
				console.warn(`[command-watcher] Org mismatch for ${cmd.id}`);
				return false;
			}

			return true;
		});

		for (const cmd of commandsForThisDevice) {
			processCommand(cmd.id, cmd.tool, cmd.params);
		}
	}, [
		shouldWatch,
		deviceInfo?.deviceId,
		organizationId,
		pendingCommands,
		processCommand,
		persistResolvedCommand,
	]);

	return {
		isWatching: shouldWatch && !!deviceInfo?.deviceId,
		deviceId: deviceInfo?.deviceId,
		pendingCount:
			pendingCommands?.filter(
				(cmd) => cmd.targetDeviceId === deviceInfo?.deviceId,
			).length ?? 0,
	};
}
