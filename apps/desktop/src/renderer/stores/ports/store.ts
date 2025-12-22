import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface DetectedPort {
	port: number;
	paneId: string;
	workspaceId: string;
	detectedAt: number;
	contextLine: string;
}

interface PortsState {
	ports: DetectedPort[];
	addPort: (port: DetectedPort) => void;
	removePort: (paneId: string, port: number) => void;
	removePortsForPane: (paneId: string) => void;
	setPorts: (ports: DetectedPort[]) => void;
}

export const usePortsStore = create<PortsState>()(
	devtools(
		(set) => ({
			ports: [],

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
		}),
		{ name: "PortsStore" },
	),
);
