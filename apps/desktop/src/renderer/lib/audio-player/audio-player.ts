let currentAudio: HTMLAudioElement | null = null;

/**
 * Plays a sound file through the specified audio output device.
 * Falls back to system default if the device is unavailable.
 */
export async function playSound({
	filename,
	deviceId,
}: {
	filename: string;
	deviceId: string | null;
}): Promise<void> {
	// Stop any currently playing sound
	stopSound();

	const audio = new Audio(`/sounds/${filename}`);
	currentAudio = audio;

	if (deviceId) {
		try {
			await audio.setSinkId(deviceId);
		} catch (error) {
			console.warn(
				"[audio-player] Failed to set audio output device, falling back to default:",
				error,
			);
		}
	}

	try {
		await audio.play();
	} catch (error) {
		console.error("[audio-player] Failed to play sound:", error);
	}
}

/**
 * Stops the currently playing sound.
 */
export function stopSound(): void {
	if (currentAudio) {
		currentAudio.pause();
		currentAudio.currentTime = 0;
		currentAudio = null;
	}
}

export interface AudioOutputDevice {
	deviceId: string;
	label: string;
}

/**
 * Lists available audio output devices.
 */
export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices
		.filter((d) => d.kind === "audiooutput")
		.map((d) => ({
			deviceId: d.deviceId,
			label: d.label || `Speaker (${d.deviceId.slice(0, 8)})`,
		}));
}
