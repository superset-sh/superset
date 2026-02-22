import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces/useCreateWorkspace";
import { useDeleteWorkspace } from "renderer/react-query/workspaces/useDeleteWorkspace";
import { useUpdateWorkspace } from "renderer/react-query/workspaces/useUpdateWorkspace";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { executeTool, type ToolContext } from "./tools";

/** Tracks command IDs that have been or are being processed to prevent duplicate execution. */
const handledCommands = new Set<string>();

export function useCommandWatcher() {
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const navigate = useNavigate();

	const organizationId = session?.session?.activeOrganizationId;
	const shouldWatch = !!deviceInfo && !!organizationId;

	const createWorktree = useCreateWorkspace({ skipNavigation: true });
	const setActive = electronTrpc.workspaces.setActive.useMutation();
	const deleteWorkspace = useDeleteWorkspace();
	const updateWorkspace = useUpdateWorkspace();

	const { data: workspaces, refetch: refetchWorkspaces } =
		electronTrpc.workspaces.getAll.useQuery();
	const { data: projects } = electronTrpc.projects.getRecents.useQuery();

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
			refetchWorkspaces: async () => refetchWorkspaces(),
			getWorkspaces: () => workspaces,
			getProjects: () => projects,
			getActiveWorkspaceId: getCurrentWorkspaceIdFromRoute,
			navigateToWorkspace: (workspaceId: string) =>
				navigateToWorkspace(workspaceId, navigate),
		}),
		[
			createWorktree,
			setActive,
			deleteWorkspace,
			updateWorkspace,
			refetchWorkspaces,
			workspaces,
			projects,
			getCurrentWorkspaceIdFromRoute,
			navigate,
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

	const processCommand = useCallback(
		async (
			commandId: string,
			tool: string,
			params: Record<string, unknown> | null,
		) => {
			if (handledCommands.has(commandId)) return;

			handledCommands.add(commandId);
			console.log(`[command-watcher] Processing: ${commandId} (${tool})`);

			try {
				const result = await executeTool(tool, params, toolContext);

				if (result.success) {
					collections.agentCommands.update(commandId, (draft) => {
						draft.status = "completed";
						draft.result = result.data ?? {};
						draft.executedAt = new Date();
					});
				} else {
					const itemErrors = (
						result.data?.errors as Array<{ error: string }> | undefined
					)
						?.map((e) => e.error)
						.join("; ");
					const fullError = itemErrors
						? `${result.error ?? "Unknown error"}: ${itemErrors}`
						: (result.error ?? "Unknown error");

					collections.agentCommands.update(commandId, (draft) => {
						draft.status = "failed";
						draft.error = fullError;
						draft.executedAt = new Date();
					});
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
				collections.agentCommands.update(commandId, (draft) => {
					draft.status = "failed";
					draft.error = errorMsg;
					draft.executedAt = new Date();
				});
			}
		},
		[collections.agentCommands, toolContext],
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

		// Expire timed-out commands before filtering for execution
		for (const cmd of pendingCommands) {
			if (cmd.targetDeviceId !== deviceInfo.deviceId) continue;
			if (cmd.organizationId !== organizationId) continue;
			if (handledCommands.has(cmd.id)) continue;
			if (cmd.timeoutAt && new Date(cmd.timeoutAt) < now) {
				collections.agentCommands.update(cmd.id, (draft) => {
					draft.status = "timeout";
					draft.error = "Command expired before execution";
				});
				handledCommands.add(cmd.id);
			}
		}

		const commandsForThisDevice = pendingCommands.filter((cmd) => {
			if (cmd.targetDeviceId !== deviceInfo.deviceId) return false;
			if (handledCommands.has(cmd.id)) return false;

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
		collections.agentCommands,
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
