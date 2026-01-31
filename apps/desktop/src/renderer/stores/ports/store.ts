import type { DetectedPort } from "shared/types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface PortsState {
	// Runtime state (not persisted)
	ports: DetectedPort[];
	// UI preferences (persisted)
	isListCollapsed: boolean;

	addPort: (port: DetectedPort) => void;
	removePort: (paneId: string, port: number) => void;
	removePortsForPane: (paneId: string) => void;
	setPorts: (ports: DetectedPort[]) => void;
	setListCollapsed: (collapsed: boolean) => void;
	toggleListCollapsed: () => void;
}

export const usePortsStore = create<PortsState>()(
	devtools(
		persist(
			(set, get) => ({
				ports: [],
				isListCollapsed: false,

				addPort: (port) =>
					set((state) => {
						// Check for duplicate
						const exists = state.ports.some(
							(p) => p.paneId === port.paneId && p.port === port.port,
						);
						if (exists) return state;
						return { ports: [...state.ports, port] };
					}),

				removePort: (paneId, port) =>
					set((state) => ({
						ports: state.ports.filter(
							(p) => !(p.paneId === paneId && p.port === port),
						),
					})),

				removePortsForPane: (paneId) =>
					set((state) => ({
						ports: state.ports.filter((p) => p.paneId !== paneId),
					})),

				setPorts: (ports) => set({ ports }),

				setListCollapsed: (collapsed) => set({ isListCollapsed: collapsed }),

				toggleListCollapsed: () =>
					set({ isListCollapsed: !get().isListCollapsed }),
			}),
			{
				name: "ports-store",
				// Only persist UI preferences, not runtime port data
				partialize: (state) => ({
					isListCollapsed: state.isListCollapsed,
				}),
			},
		),
		{ name: "PortsStore" },
	),
);
