import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { trpcAudioDeviceStorage } from "../../lib/trpc-storage";

interface AudioDeviceState {
	/** Selected audio output device ID, or null for system default */
	selectedDeviceId: string | null;

	/** Set the audio output device ID */
	setDeviceId: (deviceId: string | null) => void;
}

export const useAudioDeviceStore = create<AudioDeviceState>()(
	devtools(
		persist(
			(set) => ({
				selectedDeviceId: null,

				setDeviceId: (deviceId: string | null) => {
					set({ selectedDeviceId: deviceId });
				},
			}),
			{
				name: "audio-device-storage",
				storage: trpcAudioDeviceStorage,
				partialize: (state) => ({
					selectedDeviceId: state.selectedDeviceId,
				}),
			},
		),
		{ name: "AudioDeviceStore" },
	),
);

// Convenience hooks
export const useSelectedAudioDeviceId = () =>
	useAudioDeviceStore((state) => state.selectedDeviceId);
export const useSetAudioDeviceId = () =>
	useAudioDeviceStore((state) => state.setDeviceId);
