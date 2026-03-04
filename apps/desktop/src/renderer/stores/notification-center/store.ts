import type { NotificationIds } from "shared/notification-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const MAX_ENTRIES = 300;

export type NotificationCenterEntryKind = "notification" | "error";

export interface NotificationCenterEntry {
	id: string;
	sourceEventId?: string;
	dedupeKey?: string;
	kind: NotificationCenterEntryKind;
	source: string;
	description: string;
	timestamp: number;
	read: boolean;
	archived: boolean;
	target?: NotificationIds;
}

interface AddEntryInput {
	sourceEventId?: string;
	dedupeKey?: string;
	kind: NotificationCenterEntryKind;
	source: string;
	description: string;
	timestamp?: number;
	target?: NotificationIds;
}

interface NotificationCenterState {
	entries: NotificationCenterEntry[];
	addEntry: (entry: AddEntryInput) => string;
	updateLatestByDedupeKey: (
		dedupeKey: string,
		patch: Partial<
			Pick<NotificationCenterEntry, "description" | "timestamp" | "target">
		>,
	) => void;
	markRead: (id: string) => void;
	markReadByDedupeKey: (dedupeKey: string) => void;
	markAllRead: (kind?: NotificationCenterEntryKind) => void;
	archive: (id: string) => void;
	archiveAll: (kind?: NotificationCenterEntryKind) => void;
}

function createId(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useNotificationCenterStore = create<NotificationCenterState>()(
	devtools(
		persist(
			(set, get) => ({
				entries: [],

				addEntry: (entry) => {
					if (entry.sourceEventId) {
						const existing = get().entries.find(
							(item) => item.sourceEventId === entry.sourceEventId,
						);
						if (existing) return existing.id;
					}

					const nextEntry: NotificationCenterEntry = {
						id: createId(entry.kind),
						sourceEventId: entry.sourceEventId,
						dedupeKey: entry.dedupeKey,
						kind: entry.kind,
						source: entry.source,
						description: entry.description,
						timestamp: entry.timestamp ?? Date.now(),
						read: false,
						archived: false,
						target: entry.target,
					};

					set((state) => {
						const baseEntries = entry.dedupeKey
							? state.entries.filter(
									(item) => item.archived || item.dedupeKey !== entry.dedupeKey,
								)
							: state.entries;

						return {
							entries: [nextEntry, ...baseEntries].slice(0, MAX_ENTRIES),
						};
					});

					return nextEntry.id;
				},

				updateLatestByDedupeKey: (dedupeKey, patch) => {
					let updated = false;
					set((state) => ({
						entries: state.entries.map((entry) => {
							if (updated || entry.archived || entry.dedupeKey !== dedupeKey) {
								return entry;
							}
							updated = true;
							return {
								...entry,
								...patch,
							};
						}),
					}));
				},

				markRead: (id) => {
					set((state) => ({
						entries: state.entries.map((entry) =>
							entry.id === id ? { ...entry, read: true } : entry,
						),
					}));
				},

				markReadByDedupeKey: (dedupeKey) => {
					set((state) => ({
						entries: state.entries.map((entry) => {
							if (entry.archived || entry.dedupeKey !== dedupeKey) return entry;
							if (entry.read) return entry;
							return { ...entry, read: true };
						}),
					}));
				},

				markAllRead: (kind) => {
					set((state) => ({
						entries: state.entries.map((entry) => {
							if (kind && entry.kind !== kind) return entry;
							if (entry.archived || entry.read) return entry;
							return { ...entry, read: true };
						}),
					}));
				},

				archive: (id) => {
					set((state) => ({
						entries: state.entries.map((entry) =>
							entry.id === id
								? { ...entry, archived: true, read: true }
								: entry,
						),
					}));
				},

				archiveAll: (kind) => {
					set((state) => ({
						entries: state.entries.map((entry) => {
							if (kind && entry.kind !== kind) return entry;
							if (entry.archived) return entry;
							return { ...entry, archived: true, read: true };
						}),
					}));
				},
			}),
			{
				name: "notification-center-store",
				version: 2,
				migrate: (persisted) => {
					const state = persisted as {
						entries?: Array<{
							id?: string;
							description?: string;
							title?: string;
							message?: string;
						}>;
					};
					if (!Array.isArray(state?.entries)) {
						return state as NotificationCenterState;
					}

					return {
						...state,
						entries: state.entries.map((entry) => {
							const derivedDescription =
								typeof entry.description === "string"
									? entry.description
									: [entry.title, entry.message]
											.filter(Boolean)
											.join(" ")
											.trim();
							return {
								...entry,
								description: derivedDescription || "Notification",
							};
						}),
					} as NotificationCenterState;
				},
				partialize: (state) => ({
					entries: state.entries,
				}),
			},
		),
		{ name: "NotificationCenterStore" },
	),
);

export const useNotificationCenterEntries = () =>
	useNotificationCenterStore((state) => state.entries);
