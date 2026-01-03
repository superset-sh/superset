import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { useOpenConfigModal } from "renderer/stores/config-modal";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";

/**
 * Data needed to create a terminal when workspace becomes ready.
 * Stored so we can create the terminal after async initialization completes.
 */
interface PendingTerminalSetup {
	workspaceId: string;
	projectId: string;
	initialCommands: string[] | null;
}

/**
 * Mutation hook for creating a new workspace
 * Automatically invalidates all workspace queries on success
 *
 * For worktree workspaces with async initialization:
 * - Returns immediately after workspace record is created
 * - Terminal tab is created when initialization completes (becomes "ready")
 *
 * For branch workspaces (no async init):
 * - Creates terminal tab immediately
 */
export function useCreateWorkspace(
	options?: Parameters<typeof trpc.workspaces.create.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast = trpc.config.dismissConfigToast.useMutation();

	// Track workspaces waiting for init to complete before creating terminal
	const pendingTerminalSetups = useRef<Map<string, PendingTerminalSetup>>(
		new Map(),
	);

	// Watch for init progress changes to create terminal when ready
	const initProgress = useWorkspaceInitStore((s) => s.initProgress);
	const clearProgress = useWorkspaceInitStore((s) => s.clearProgress);

	// Helper to handle terminal setup for a ready workspace
	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup) => {
			if (
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0
			) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");
				createOrAttach.mutate({
					paneId,
					tabId,
					workspaceId: setup.workspaceId,
					initialCommands: setup.initialCommands,
				});
			} else {
				// Show config toast if no setup commands
				toast.info("No setup script configured", {
					description: "Automate workspace setup with a config.json file",
					action: {
						label: "Configure",
						onClick: () => openConfigModal(setup.projectId),
					},
					onDismiss: () => {
						dismissConfigToast.mutate({ projectId: setup.projectId });
					},
				});
			}
			// Clear progress after handling - prevents memory buildup
			clearProgress(setup.workspaceId);
		},
		[
			addTab,
			setTabAutoTitle,
			createOrAttach,
			openConfigModal,
			dismissConfigToast,
			clearProgress,
		],
	);

	// Effect to create terminal when pending workspaces become ready
	useEffect(() => {
		for (const [workspaceId, setup] of pendingTerminalSetups.current) {
			const progress = initProgress[workspaceId];

			// Create terminal when workspace becomes ready
			if (progress?.step === "ready") {
				pendingTerminalSetups.current.delete(workspaceId);
				handleTerminalSetup(setup);
			}

			// Clear from pending if failed (user will use retry or delete)
			if (progress?.step === "failed") {
				pendingTerminalSetups.current.delete(workspaceId);
			}
		}
	}, [initProgress, handleTerminalSetup]);

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			const setup: PendingTerminalSetup = {
				workspaceId: data.workspace.id,
				projectId: data.projectId,
				initialCommands: data.initialCommands,
			};

			// If workspace is still initializing, defer terminal creation
			if (data.isInitializing) {
				// Check if init already completed (race condition: "ready" arrived before onSuccess)
				const currentProgress =
					useWorkspaceInitStore.getState().initProgress[data.workspace.id];

				if (currentProgress?.step === "ready") {
					// Already ready - create terminal immediately
					handleTerminalSetup(setup);
				} else if (currentProgress?.step === "failed") {
					// Already failed - don't add to pending (user will use retry or delete)
				} else {
					// Still initializing - add to pending for effect to pick up
					pendingTerminalSetups.current.set(data.workspace.id, setup);
				}
			} else {
				// Workspace is ready immediately (shouldn't happen for worktrees, but handle it)
				handleTerminalSetup(setup);
			}

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
