import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { PendingTerminalSetup } from "renderer/stores/workspace-init";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

type MutationOptions = Parameters<
	typeof electronTrpc.workspaces.create.useMutation
>[0];

interface UseCreateWorkspaceOptions extends NonNullable<MutationOptions> {
	skipNavigation?: boolean;
	resolveInitialCommands?: (serverCommands: string[] | null) => string[] | null;
}

type PendingSetupOverrides = Pick<
	PendingTerminalSetup,
	"defaultPresets" | "agentCommand" | "agentLaunchRequest"
>;

export function useCreateWorkspace(options?: UseCreateWorkspaceOptions) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);
	const updateProgress = useWorkspaceInitStore((s) => s.updateProgress);
	const pendingSetupOverridesByCallKey = useRef(
		new Map<symbol, PendingSetupOverrides>(),
	);
	const callKeyByVariables = useRef(new WeakMap<object, symbol>());

	const mutation = electronTrpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, variables, ...rest) => {
			const variablesKey =
				typeof variables === "object" && variables !== null
					? (variables as object)
					: null;
			const callKey = variablesKey
				? callKeyByVariables.current.get(variablesKey)
				: undefined;
			const pendingSetupOverrides = callKey
				? pendingSetupOverridesByCallKey.current.get(callKey)
				: undefined;

			if (variablesKey) {
				callKeyByVariables.current.delete(variablesKey);
			}
			if (callKey) {
				pendingSetupOverridesByCallKey.current.delete(callKey);
			}

			// Set optimistic progress before navigation to prevent "Setup incomplete" flash
			if (data.isInitializing) {
				const optimisticProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "pending",
					message: "Preparing...",
				};
				updateProgress(optimisticProgress);
			}

			if (!data.isInitializing && data.autoRenameWarning) {
				toast.warning("Workspace created without auto-name", {
					description: data.autoRenameWarning,
				});
			}

			if (!data.wasExisting) {
				const normalizedLaunchRequest =
					pendingSetupOverrides?.agentLaunchRequest
						? {
								...pendingSetupOverrides.agentLaunchRequest,
								workspaceId: data.workspace.id,
							}
						: undefined;
				addPendingTerminalSetup({
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					initialCommands: options?.resolveInitialCommands
						? options.resolveInitialCommands(data.initialCommands)
						: data.initialCommands,
					defaultPresets: pendingSetupOverrides?.defaultPresets,
					agentCommand: pendingSetupOverrides?.agentCommand,
					agentLaunchRequest: normalizedLaunchRequest,
				});
			}

			await utils.workspaces.invalidate();

			if (!options?.skipNavigation) {
				navigateToWorkspace(data.workspace.id, navigate, { replace: true });
			}

			await options?.onSuccess?.(data, variables, ...rest);
		},
	});

	const mutateAsyncWithPendingSetup = useCallback(
		async (
			input: Parameters<typeof mutation.mutateAsync>[0],
			pendingSetupOverrides?: PendingSetupOverrides,
		) => {
			const variables =
				typeof input === "object" && input !== null
					? ({ ...input } as Parameters<typeof mutation.mutateAsync>[0])
					: input;
			const variablesKey =
				typeof variables === "object" && variables !== null
					? (variables as object)
					: null;
			const callKey = pendingSetupOverrides ? Symbol("pending-setup") : null;

			if (callKey && variablesKey && pendingSetupOverrides) {
				pendingSetupOverridesByCallKey.current.set(
					callKey,
					pendingSetupOverrides,
				);
				callKeyByVariables.current.set(variablesKey, callKey);
			}
			try {
				return await mutation.mutateAsync(variables);
			} finally {
				if (variablesKey) {
					callKeyByVariables.current.delete(variablesKey);
				}
				if (callKey) {
					pendingSetupOverridesByCallKey.current.delete(callKey);
				}
			}
		},
		[mutation],
	);

	return {
		...mutation,
		mutateAsyncWithPendingSetup,
	};
}
