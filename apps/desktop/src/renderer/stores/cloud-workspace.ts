import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface CloudWorkspaceState {
	/** Currently active cloud workspace session ID */
	activeSessionId: string | null;

	/** Set the active cloud workspace session */
	setActiveSession: (sessionId: string | null) => void;

	/** Clear the active session */
	clearActiveSession: () => void;
}

export const useCloudWorkspaceStore = create<CloudWorkspaceState>()(
	devtools(
		(set) => ({
			activeSessionId: null,

			setActiveSession: (sessionId) => {
				set({ activeSessionId: sessionId });
			},

			clearActiveSession: () => {
				set({ activeSessionId: null });
			},
		}),
		{ name: "CloudWorkspaceStore" },
	),
);
