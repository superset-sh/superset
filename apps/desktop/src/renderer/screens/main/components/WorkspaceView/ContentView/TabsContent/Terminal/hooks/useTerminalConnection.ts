import { useRef, useState } from "react";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	const createOrAttachMutation = useCreateOrAttachWithTheme();
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
	const writeRef = useRef<TerminalWriteMutate>((input) => {
		writeMutation.mutate({ ...input, workspaceId });
	});
	const resizeRef = useRef<TerminalResizeMutate>((input) => {
		resizeMutation.mutate({ ...input, workspaceId });
	});
	const detachRef = useRef<TerminalDetachMutate>((input) => {
		detachMutation.mutate({ ...input, workspaceId });
	});
	const clearScrollbackRef = useRef<TerminalClearScrollbackMutate>((input) => {
		clearScrollbackMutation.mutate({ ...input, workspaceId });
	});

	// Keep refs up to date
	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = (input) => {
		writeMutation.mutate({ ...input, workspaceId });
	};
	resizeRef.current = (input) => {
		resizeMutation.mutate({ ...input, workspaceId });
	};
	detachRef.current = (input) => {
		detachMutation.mutate({ ...input, workspaceId });
	};
	clearScrollbackRef.current = (input) => {
		clearScrollbackMutation.mutate({ ...input, workspaceId });
	};

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
