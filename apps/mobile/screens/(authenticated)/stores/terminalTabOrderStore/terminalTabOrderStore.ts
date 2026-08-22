import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Device-local tab arrangement: workspaceId → terminalIds in the order the
 * user dragged them. Only ids the user has actually arranged are stored, so a
 * session that shows up on the host while the app is away is appended rather
 * than reshuffling the saved order.
 */
interface TerminalTabOrderStore {
	orderByWorkspace: Record<string, string[]>;
	setTabOrder: (workspaceId: string, terminalIds: string[]) => void;
}

export const useTerminalTabOrderStore = create<TerminalTabOrderStore>()(
	persist(
		(set) => ({
			orderByWorkspace: {},
			setTabOrder: (workspaceId, terminalIds) => {
				set((state) => ({
					orderByWorkspace: {
						...state.orderByWorkspace,
						[workspaceId]: terminalIds,
					},
				}));
			},
		}),
		{
			name: "terminal-tab-order-v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
