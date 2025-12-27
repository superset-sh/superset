import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	DEFAULT_RINGTONE_ID,
	RINGTONES,
	type RingtoneData,
} from "../../../shared/ringtones";
import { trpcRingtoneStorage } from "../../lib/trpc-storage";

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

/** Check if a ringtone ID is valid */
function isValidRingtoneId(id: string): boolean {
	return AVAILABLE_RINGTONES.some((r) => r.id === id);
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

export const useRingtoneStore = create<RingtoneState>()(
	devtools(
		persist(
			(set, get) => ({
				selectedRingtoneId: DEFAULT_RINGTONE_ID,

				setRingtone: (ringtoneId: string) => {
					const ringtone = AVAILABLE_RINGTONES.find((r) => r.id === ringtoneId);
					if (!ringtone) {
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
				storage: trpcRingtoneStorage,
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

// Convenience hooks
export const useSelectedRingtoneId = () =>
	useRingtoneStore((state) => state.selectedRingtoneId);
export const useSetRingtone = () =>
	useRingtoneStore((state) => state.setRingtone);
export const useSelectedRingtone = () =>
	useRingtoneStore((state) => {
		const ringtone = AVAILABLE_RINGTONES.find(
			(r) => r.id === state.selectedRingtoneId,
		);
		// Fall back to default if ID is invalid
		return ringtone ?? getDefaultRingtone();
	});
