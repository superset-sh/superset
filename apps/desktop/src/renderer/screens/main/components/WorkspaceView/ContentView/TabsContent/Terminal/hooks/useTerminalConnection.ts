import { useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface UseTerminalConnectionOptions {
	workspaceId: string;
}

/**
 * Hook to manage terminal connection state and mutations.
 *
 * Encapsulates:
 * - tRPC mutations (createOrAttach, write, resize, detach, clearScrollback)
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
	const createOrAttachMutation =
		electronTrpc.terminal.createOrAttach.useMutation();
	const writeMutation = electronTrpc.terminal.write.useMutation();
	const resizeMutation = electronTrpc.terminal.resize.useMutation();
	const detachMutation = electronTrpc.terminal.detach.useMutation();
	const clearScrollbackMutation =
		electronTrpc.terminal.clearScrollback.useMutation();

	// Query for workspace cwd
	const { data: workspaceCwd } =
		electronTrpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	// Stable refs to mutation functions - these don't change identity on re-render
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);
	const clearScrollbackRef = useRef(clearScrollbackMutation.mutate);

	// Keep refs up to date
	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;
	clearScrollbackRef.current = clearScrollbackMutation.mutate;

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
