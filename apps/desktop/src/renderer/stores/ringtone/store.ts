import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	DEFAULT_RINGTONE_ID,
	RINGTONES,
	type RingtoneData,
} from "../../../shared/ringtones";
import { electronStorage } from "../../lib/electron-storage";

// Re-export shared types and data for convenience
export type Ringtone = RingtoneData;
export const AVAILABLE_RINGTONES = RINGTONES;
export { DEFAULT_RINGTONE_ID };

interface RingtoneState {
	/** Current selected ringtone ID */
	selectedRingtoneId: string;

	/** Set the active ringtone by ID */
	setRingtone: (ringtoneId: string) => void;

	/** Get the currently selected ringtone */
	getSelectedRingtone: () => Ringtone | undefined;
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
					return AVAILABLE_RINGTONES.find(
						(r) => r.id === state.selectedRingtoneId,
					);
				},
			}),
			{
				name: "ringtone-storage",
				storage: electronStorage,
				partialize: (state) => ({
					selectedRingtoneId: state.selectedRingtoneId,
				}),
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
	useRingtoneStore((state) =>
		AVAILABLE_RINGTONES.find((r) => r.id === state.selectedRingtoneId),
	);
