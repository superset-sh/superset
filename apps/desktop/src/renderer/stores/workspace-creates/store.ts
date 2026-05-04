import type { AppRouter } from "@superset/host-service";
import type { inferRouterInputs } from "@trpc/server";
import { create } from "zustand";

export type WorkspacesCreateInput =
	inferRouterInputs<AppRouter>["workspaces"]["create"];

export interface InFlightEntry {
	hostId: string;
	snapshot: WorkspacesCreateInput;
	state: "creating" | "error";
	error?: string;
	startedAt: number;
}

interface WorkspaceCreatesState {
	entries: InFlightEntry[];
	add: (entry: Omit<InFlightEntry, "startedAt">) => void;
	markError: (workspaceId: string, error: string) => void;
	markCreating: (workspaceId: string) => void;
	remove: (workspaceId: string) => void;
}

export const useWorkspaceCreatesStore = create<WorkspaceCreatesState>(
	(set) => ({
		entries: [],
		add: (entry) =>
			set((state) => ({
				entries: [...state.entries, { ...entry, startedAt: Date.now() }],
			})),
		markError: (workspaceId, error) =>
			set((state) => ({
				entries: state.entries.map((entry) =>
					entry.snapshot.id === workspaceId
						? { ...entry, state: "error", error }
						: entry,
				),
			})),
		markCreating: (workspaceId) =>
			set((state) => ({
				entries: state.entries.map((entry) =>
					entry.snapshot.id === workspaceId
						? { ...entry, state: "creating", error: undefined }
						: entry,
				),
			})),
		remove: (workspaceId) =>
			set((state) => ({
				entries: state.entries.filter(
					(entry) => entry.snapshot.id !== workspaceId,
				),
			})),
	}),
);
