import type { SelectV2Workspace } from "@superset/db/schema";
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
	/**
	 * Cloud row returned by the host-service mutation. Set once
	 * `workspaces.create` resolves successfully — the workspace detail
	 * layout falls back to this row while Electric hasn't yet delivered
	 * the synced row into `collections.v2Workspaces`.
	 */
	cloudRow?: SelectV2Workspace;
}

interface WorkspaceCreatesState {
	entries: InFlightEntry[];
	add: (entry: Omit<InFlightEntry, "startedAt">) => void;
	markError: (workspaceId: string, error: string) => void;
	markCreating: (workspaceId: string) => void;
	markCloudRow: (workspaceId: string, cloudRow: SelectV2Workspace) => void;
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
		markCloudRow: (workspaceId, cloudRow) =>
			set((state) => ({
				entries: state.entries.map((entry) =>
					entry.snapshot.id === workspaceId ? { ...entry, cloudRow } : entry,
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
