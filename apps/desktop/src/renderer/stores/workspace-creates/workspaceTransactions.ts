import type { WorkspaceCreateProgressPayload } from "@superset/workspace-client";
import { create } from "zustand";

export type WorkspaceTransactionType = "insert" | "update" | "delete";
export type WorkspaceTransactionState = "pending" | "persisting";
export type TrackableWorkspaceTransactionState =
	| WorkspaceTransactionState
	| "completed"
	| "failed";

export interface WorkspaceTransactionProgress {
	projectId: string;
	stage: WorkspaceCreateProgressPayload["stage"];
	message: string;
	percent: number | null;
	updatedAt: Date;
}

export interface WorkspaceTransactionSnapshot {
	id: string;
	workspaceId: string;
	type: WorkspaceTransactionType;
	state: WorkspaceTransactionState;
	createdAt: Date;
	updatedAt: Date;
	progress: WorkspaceTransactionProgress | null;
}

interface TrackableWorkspaceTransaction {
	id: string;
	state: TrackableWorkspaceTransactionState;
	createdAt: Date;
	mutations: Array<{ type: WorkspaceTransactionType }>;
	isPersisted: {
		promise: Promise<unknown>;
	};
}

interface WorkspaceTransactionsState {
	byWorkspaceId: Record<string, WorkspaceTransactionSnapshot>;
	track: (
		workspaceId: string,
		transaction: TrackableWorkspaceTransaction,
	) => void;
	updateProgress: (
		workspaceId: string,
		progress: WorkspaceCreateProgressPayload,
	) => void;
	clear: (workspaceId: string) => void;
}

export const useWorkspaceTransactionsStore = create<WorkspaceTransactionsState>(
	(set, get) => ({
		byWorkspaceId: {},
		track: (workspaceId, transaction) => {
			const mutation = transaction.mutations[0];
			if (!mutation) return;
			if (transaction.state === "completed" || transaction.state === "failed") {
				return;
			}

			const writeSnapshot = (state: WorkspaceTransactionState) => {
				set((current) => ({
					byWorkspaceId: {
						...current.byWorkspaceId,
						[workspaceId]: {
							id: transaction.id,
							workspaceId,
							type: mutation.type,
							state,
							createdAt: transaction.createdAt,
							updatedAt: new Date(),
							progress: current.byWorkspaceId[workspaceId]?.progress ?? null,
						},
					},
				}));
			};

			writeSnapshot(transaction.state);

			void transaction.isPersisted.promise.then(
				() => {
					if (get().byWorkspaceId[workspaceId]?.id === transaction.id) {
						get().clear(workspaceId);
					}
				},
				() => {
					if (get().byWorkspaceId[workspaceId]?.id === transaction.id) {
						get().clear(workspaceId);
					}
				},
			);
		},
		updateProgress: (workspaceId, progress) =>
			set((state) => {
				const existing = state.byWorkspaceId[workspaceId];
				if (!existing) return state;
				return {
					byWorkspaceId: {
						...state.byWorkspaceId,
						[workspaceId]: {
							...existing,
							updatedAt: new Date(progress.occurredAt),
							progress: {
								projectId: progress.projectId,
								stage: progress.stage,
								message: progress.message,
								percent: progress.percent,
								updatedAt: new Date(progress.occurredAt),
							},
						},
					},
				};
			}),
		clear: (workspaceId) =>
			set((state) => {
				if (!state.byWorkspaceId[workspaceId]) return state;
				const { [workspaceId]: _removed, ...rest } = state.byWorkspaceId;
				return { byWorkspaceId: rest };
			}),
	}),
);
