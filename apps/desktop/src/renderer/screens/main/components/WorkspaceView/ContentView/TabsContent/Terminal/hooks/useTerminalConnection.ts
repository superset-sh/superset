import { useRef, useState } from "react";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	TerminalClearScrollbackMutate,
	TerminalDetachMutate,
	TerminalResizeMutate,
	TerminalWriteMutate,
} from "../types";

export interface UseTerminalConnectionOptions {
	workspaceId: string;
}

/**
 * Hook to manage terminal connection state and mutations.
 *
 * Encapsulates:
 * - createOrAttach mutation (for lifecycle callbacks)
 * - imperative tRPC calls for write/resize/detach/clearScrollback hot paths
 * - Stable refs to mutation functions (to avoid re-renders)
 * - Connection error state
 * - Workspace CWD query
 *
 * NOTE: Stream subscription is intentionally NOT included here because it needs
 * direct access to xterm refs for event handling. Keep that in the component.
 */
export function useTerminalConnection({
	workspaceId,
}: UseTerminalConnectionOptions) {
	const [connectionError, setConnectionError] = useState<string | null>(null);

	// tRPC mutations
	const createOrAttachMutation = useCreateOrAttachWithTheme();

	// Query for workspace cwd
	const { data: workspaceCwd } =
		electronTrpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	// Stable refs - these don't change identity on re-render
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	// Use imperative client calls for write/resize/detach/clear to avoid
	// mutation-observer re-renders on every keystroke.
	const writeRef = useRef<TerminalWriteMutate>((input, callbacks) => {
		electronTrpcClient.terminal.write
			.mutate(input)
			.then(() => {
				callbacks?.onSuccess?.();
			})
			.catch((error) => {
				callbacks?.onError?.({
					message: error instanceof Error ? error.message : "Write failed",
				});
			})
			.finally(() => {
				callbacks?.onSettled?.();
			});
	});
	const resizeRef = useRef<TerminalResizeMutate>((input) => {
		electronTrpcClient.terminal.resize.mutate(input).catch((error) => {
			console.warn("[Terminal] Failed to resize terminal:", error);
		});
	});
	const detachRef = useRef<TerminalDetachMutate>((input) => {
		electronTrpcClient.terminal.detach.mutate(input).catch((error) => {
			console.warn("[Terminal] Failed to detach terminal:", error);
		});
	});
	const clearScrollbackRef = useRef<TerminalClearScrollbackMutate>((input) => {
		electronTrpcClient.terminal.clearScrollback.mutate(input).catch((error) => {
			console.warn("[Terminal] Failed to clear scrollback:", error);
		});
	});

	// Keep refs up to date
	createOrAttachRef.current = createOrAttachMutation.mutate;

	return {
		// Connection error state
		connectionError,
		setConnectionError,

		// Workspace CWD from query
		workspaceCwd,

		// Stable refs to mutation functions (use these in effects/callbacks)
		refs: {
			createOrAttach: createOrAttachRef,
			write: writeRef,
			resize: resizeRef,
			detach: detachRef,
			clearScrollback: clearScrollbackRef,
		},
	};
}
