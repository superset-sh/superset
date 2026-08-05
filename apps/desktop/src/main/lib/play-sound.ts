import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

interface PlaySoundCallbacks {
	onComplete?: () => void;
	isCanceled?: () => boolean;
	onProcessChange?: (process: ChildProcess) => void;
}

/**
 * Plays a sound file at the given volume using platform-specific commands.
 * Returns the primary ChildProcess, or null if playback was skipped.
 *
 * On macOS, volume is controlled via afplay -v (0.0-1.0).
 * On Linux, volume is controlled via paplay --volume (0-65536), with aplay fallback.
 * On Windows, volume is played via PowerShell System.Media.SoundPlayer (system volume).
 */
export function playSoundFile(
	soundPath: string,
	volume: number = 100,
	callbacks?: PlaySoundCallbacks,
): ChildProcess | null {
	if (!existsSync(soundPath)) {
		console.warn(`[play-sound] Sound file not found: ${soundPath}`);
		return null;
	}

	const volumeDecimal = volume / 100;

	if (process.platform === "darwin") {
		return execFile("afplay", ["-v", volumeDecimal.toString(), soundPath], () =>
			callbacks?.onComplete?.(),
		);
	}

	if (process.platform === "win32") {
		// PowerShell System.Media.SoundPlayer plays WAV files using the system volume.
		// Per-sound software volume control is not available without native dependencies,
		// so we respect the volume=0 mute signal and skip playback entirely in that case.
		if (volume === 0) {
			callbacks?.onComplete?.();
			return null;
		}
		// Single-quote escaping for PowerShell string literal
		const escapedPath = soundPath.replace(/'/g, "''");
		return execFile(
			"powershell",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				`(New-Object System.Media.SoundPlayer '${escapedPath}').PlaySync()`,
			],
			{ windowsHide: true },
			() => callbacks?.onComplete?.(),
		);
	}

	// Linux: paplay --volume accepts 0-65536 (65536 = 100%)
	const paVolume = Math.round(volumeDecimal * 65536);
	return execFile(
		"paplay",
		["--volume", paVolume.toString(), soundPath],
		(error) => {
			if (error) {
				if (callbacks?.isCanceled?.()) {
					callbacks?.onComplete?.();
					return;
				}
				if (volume === 0) {
					callbacks?.onComplete?.();
					return;
				}
				const fallback = execFile("aplay", [soundPath], () =>
					callbacks?.onComplete?.(),
				);
				callbacks?.onProcessChange?.(fallback);
				return;
			}
			callbacks?.onComplete?.();
		},
	);
}
