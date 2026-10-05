import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface RestoreWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
	branch: string;
	/** Owning host's machine id — archived rows are absent from the live
	 * lists the host lookup reads, so the target rides along instead. */
	hostId: string | null;
}

/**
 * Drives the single globally-mounted v2 restore dialog
 * (RestoreWorkspaceMount). Like delete, restore acts on rows that may
 * unmount mid-flight, so entry points request through this store instead of
 * rendering the dialog under the row.
 */
interface RestoreWorkspaceIntentState {
	target: RestoreWorkspaceTarget | null;
	open: boolean;
	request: (target: RestoreWorkspaceTarget) => void;
	setOpen: (workspaceId: string, open: boolean) => void;
	close: (workspaceId: string) => void;
}

export const useRestoreWorkspaceIntent = create<RestoreWorkspaceIntentState>()(
	devtools(
		(set) => ({
			target: null,
			open: false,
			request: (target) => set({ target, open: true }),
			setOpen: (workspaceId, open) =>
				set((state) =>
					state.target?.workspaceId === workspaceId ? { open } : state,
				),
			close: (workspaceId) =>
				set((state) =>
					state.target?.workspaceId === workspaceId
						? { target: null, open: false }
						: state,
				),
		}),
		{ name: "RestoreWorkspaceIntent" },
	),
);
