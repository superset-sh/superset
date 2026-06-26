import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

interface PlaySoundCallbacks {
	onComplete?: () => void;
	isCanceled?: () => boolean;
	onProcessChange?: (process: ChildProcess) => void;
}

export interface PlayCommand {
	command: string;
	args: string[];
}

/**
 * Returns the ordered list of player commands to attempt for the given
 * platform. Notification sounds ship as MP3, so on Linux MP3-capable players
 * are tried before paplay/aplay. paplay/aplay only decode PCM/WAV — feeding
 * them an MP3 either errors out or, in aplay's case, plays the compressed
 * bytes as raw PCM and produces static noise (issue #4899).
 */
export function getPlayCommands(
	platform: NodeJS.Platform,
	soundPath: string,
	volume: number,
): PlayCommand[] {
	const clamped = Math.max(0, Math.min(100, volume));
	const volumeDecimal = clamped / 100;

	if (platform === "darwin") {
		return [
			{
				command: "afplay",
				args: ["-v", volumeDecimal.toString(), soundPath],
			},
		];
	}

	const volumePercent = Math.round(volumeDecimal * 100);
	const paVolume = Math.round(volumeDecimal * 65536);
	const mpgFactor = Math.round(volumeDecimal * 32768);

	return [
		{
			command: "mpg123",
			args: ["-q", "-f", mpgFactor.toString(), soundPath],
		},
		{
			command: "ffplay",
			args: [
				"-nodisp",
				"-autoexit",
				"-loglevel",
				"quiet",
				"-volume",
				volumePercent.toString(),
				soundPath,
			],
		},
		{
			command: "mpv",
			args: [
				"--no-video",
				"--really-quiet",
				`--volume=${volumePercent}`,
				soundPath,
			],
		},
		// Legacy fallbacks. These only handle PCM/WAV; included so non-MP3
		// custom ringtones still work.
		{
			command: "paplay",
			args: ["--volume", paVolume.toString(), soundPath],
		},
		{ command: "aplay", args: [soundPath] },
	];
}

/**
 * Plays a sound file at the given volume using platform-specific commands.
 * Returns the first ChildProcess that was spawned, or null if playback was
 * skipped. On Linux, multiple players are tried in order until one starts
 * successfully.
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

	const commands = getPlayCommands(process.platform, soundPath, volume);
	if (commands.length === 0) {
		callbacks?.onComplete?.();
		return null;
	}

	let index = 0;
	let primary: ChildProcess | null = null;

	const tryNext = (): ChildProcess | null => {
		if (index >= commands.length) {
			callbacks?.onComplete?.();
			return null;
		}
		const { command, args } = commands[index];
		index += 1;

		const child = execFile(command, args, (error) => {
			if (callbacks?.isCanceled?.()) {
				callbacks?.onComplete?.();
				return;
			}
			if (!error || volume === 0) {
				callbacks?.onComplete?.();
				return;
			}
			const next = tryNext();
			if (next && next !== primary) {
				callbacks?.onProcessChange?.(next);
			}
		});

		return child;
	};

	primary = tryNext();
	return primary;
}
