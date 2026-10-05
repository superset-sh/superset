import type { TeleportProgress } from "@superset/shared/teleport-driver";
import { create } from "zustand";
import type { TeleportDestination, TeleportRunState } from "../../types";
import { applyTeleportProgress } from "../../utils/runOutcome";

/**
 * A move in flight, keyed by the workspace it moves. It lives here and not
 * in the dialog so the dialog can be closed and reopened while the move
 * runs, the sidebar can show that it runs, and its ending can be announced
 * when nobody is looking at it. In memory only: a move does not survive the
 * renderer, and the host side owns the durable state (the ref, the box).
 */
export interface TeleportRunRecord {
	destination: TeleportDestination;
	run: TeleportRunState;
	/** The cloud row the move goes to, once it exists. */
	cloudDestinationId: string | null;
	/** True while the dialog shows this run; an unwatched ending is a toast. */
	watched: boolean;
	startedAt: number;
}

interface TeleportRunsState {
	runs: Record<string, TeleportRunRecord>;
	begin: (workspaceId: string, destination: TeleportDestination) => void;
	progress: (workspaceId: string, event: TeleportProgress) => void;
	setCloudDestination: (
		workspaceId: string,
		cloudDestinationId: string,
	) => void;
	setWatched: (workspaceId: string, watched: boolean) => void;
	clear: (workspaceId: string) => void;
}

export const useTeleportRunsStore = create<TeleportRunsState>()((set) => ({
	runs: {},
	begin: (workspaceId, destination) =>
		set((state) => ({
			runs: {
				...state.runs,
				[workspaceId]: {
					destination,
					run: { steps: {}, error: null },
					cloudDestinationId: null,
					watched: true,
					startedAt: Date.now(),
				},
			},
		})),
	progress: (workspaceId, event) =>
		set((state) => {
			const record = state.runs[workspaceId];
			if (!record) return state;
			return {
				runs: {
					...state.runs,
					[workspaceId]: {
						...record,
						run: applyTeleportProgress(record.run, event),
					},
				},
			};
		}),
	setCloudDestination: (workspaceId, cloudDestinationId) =>
		set((state) => {
			const record = state.runs[workspaceId];
			if (!record) return state;
			return {
				runs: {
					...state.runs,
					[workspaceId]: { ...record, cloudDestinationId },
				},
			};
		}),
	setWatched: (workspaceId, watched) =>
		set((state) => {
			const record = state.runs[workspaceId];
			if (!record || record.watched === watched) return state;
			return { runs: { ...state.runs, [workspaceId]: { ...record, watched } } };
		}),
	clear: (workspaceId) =>
		set((state) => {
			if (!(workspaceId in state.runs)) return state;
			const { [workspaceId]: _, ...runs } = state.runs;
			return { runs };
		}),
}));
