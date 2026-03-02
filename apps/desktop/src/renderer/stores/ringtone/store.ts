import { create } from "zustand";
import {
	createJSONStorage,
	devtools,
	persist,
	type StateStorage,
} from "zustand/middleware";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	RINGTONES,
	type RingtoneData,
} from "../../../shared/ringtones";
import { electronTrpcClient } from "../../lib/trpc-client";

// Re-export shared types and data for convenience
export type Ringtone = RingtoneData;
export const AVAILABLE_RINGTONES = RINGTONES;
export { DEFAULT_RINGTONE_ID };

interface RingtoneState {
	/** Current selected ringtone ID */
	selectedRingtoneId: string;

	/** Set the active ringtone by ID */
	setRingtone: (ringtoneId: string) => void;

	/** Get the currently selected ringtone (always returns valid ringtone, falls back to default) */
	getSelectedRingtone: () => Ringtone;
}

interface PersistedRingtoneState {
	selectedRingtoneId: string;
}

/** Check if a ringtone ID is valid */
function isValidRingtoneId(id: string): boolean {
	return (
		id === CUSTOM_RINGTONE_ID || AVAILABLE_RINGTONES.some((r) => r.id === id)
	);
}

/** Get default ringtone (guaranteed to exist) */
function getDefaultRingtone(): Ringtone {
	const ringtone = AVAILABLE_RINGTONES.find(
		(r) => r.id === DEFAULT_RINGTONE_ID,
	);
	if (!ringtone) {
		throw new Error(`Default ringtone "${DEFAULT_RINGTONE_ID}" not found`);
	}
	return ringtone;
}

let applyCanonicalRingtoneId: ((ringtoneId: string) => void) | null = null;

const ringtoneStorage = createJSONStorage(
	(): StateStorage => ({
		getItem: async (name: string): Promise<string | null> => {
			try {
				const ringtoneId =
					await electronTrpcClient.settings.getSelectedRingtoneId.query();
				const version = Number.parseInt(
					localStorage.getItem(`${name}:version`) ?? "0",
					10,
				);
				return JSON.stringify({
					state: {
						selectedRingtoneId: ringtoneId,
					} satisfies PersistedRingtoneState,
					version,
				});
			} catch (error) {
				console.error("[ringtone-store] Failed to load ringtone state:", error);
				return null;
			}
		},
		setItem: async (name: string, value: string): Promise<void> => {
			try {
				const parsed = JSON.parse(value) as {
					state: PersistedRingtoneState;
					version: number;
				};
				localStorage.setItem(`${name}:version`, String(parsed.version));
				await electronTrpcClient.settings.setSelectedRingtoneId.mutate({
					ringtoneId: parsed.state.selectedRingtoneId,
				});
			} catch (error) {
				console.error(
					"[ringtone-store] Failed to persist ringtone state:",
					error,
				);

				try {
					const canonicalRingtoneId =
						await electronTrpcClient.settings.getSelectedRingtoneId.query();
					applyCanonicalRingtoneId?.(canonicalRingtoneId);
				} catch {
					// Ignore secondary failures while already handling persistence failure.
				}
			}
		},
		removeItem: async (): Promise<void> => {
			// Reset to defaults is handled by store logic.
		},
	}),
);

export const useRingtoneStore = create<RingtoneState>()(
	devtools(
		persist(
			(set, get) => ({
				selectedRingtoneId: DEFAULT_RINGTONE_ID,

				setRingtone: (ringtoneId: string) => {
					if (!isValidRingtoneId(ringtoneId)) {
						console.error(`Ringtone not found: ${ringtoneId}`);
						return;
					}
					set({ selectedRingtoneId: ringtoneId });
				},

				getSelectedRingtone: () => {
					const state = get();
					const ringtone = AVAILABLE_RINGTONES.find(
						(r) => r.id === state.selectedRingtoneId,
					);
					if (state.selectedRingtoneId === CUSTOM_RINGTONE_ID) {
						// Custom ringtones are resolved by backend file state, not the built-in list.
						return getDefaultRingtone();
					}
					// Fall back to default if persisted ID is stale/invalid
					if (!ringtone) {
						set({ selectedRingtoneId: DEFAULT_RINGTONE_ID });
						return getDefaultRingtone();
					}
					return ringtone;
				},
			}),
			{
				name: "ringtone-storage",
				storage: ringtoneStorage,
				partialize: (state) => ({
					selectedRingtoneId: state.selectedRingtoneId,
				}),
				onRehydrateStorage: () => (state) => {
					// Validate persisted ringtone ID on rehydration
					if (state && !isValidRingtoneId(state.selectedRingtoneId)) {
						console.warn(
							`[RingtoneStore] Invalid ringtone ID "${state.selectedRingtoneId}", resetting to default`,
						);
						state.selectedRingtoneId = DEFAULT_RINGTONE_ID;
					}
				},
			},
		),
		{ name: "RingtoneStore" },
	),
);
applyCanonicalRingtoneId = (canonicalRingtoneId) => {
	const current = useRingtoneStore.getState().selectedRingtoneId;
	if (current === canonicalRingtoneId) {
		return;
	}
	useRingtoneStore.setState({ selectedRingtoneId: canonicalRingtoneId });
};

// Convenience hooks
export const useSelectedRingtoneId = () =>
	useRingtoneStore((state) => state.selectedRingtoneId);
export const useSetRingtone = () =>
	useRingtoneStore((state) => state.setRingtone);
