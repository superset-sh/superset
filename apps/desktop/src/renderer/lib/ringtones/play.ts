import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	getRingtoneById,
} from "shared/ringtones";
import { electronTrpcClient } from "../trpc-client";
import { builtInRingtoneUrls } from "./urls";

export interface PlayRingtoneOptions {
	ringtoneId: string;
	/** 0..100 — matches the existing `notificationVolume` setting shape. */
	volume: number;
	muted: boolean;
}

const builtInAudioByUrl = new Map<string, HTMLAudioElement>();

/**
 * Resolve the bundled audio URL for a built-in ringtone id. Custom uploads are
 * stored outside the Vite bundle, so they are played by main on renderer
 * request instead of exposing local file paths to the web runtime.
 */
function resolveRingtoneUrl(ringtoneId: string): string | null {
	const ringtone = getRingtoneById(ringtoneId);
	const resolved = ringtone
		? builtInRingtoneUrls[ringtone.filename]
		: undefined;
	if (resolved) return resolved;

	const fallback = getRingtoneById(DEFAULT_RINGTONE_ID);
	return fallback ? (builtInRingtoneUrls[fallback.filename] ?? null) : null;
}

function getBuiltInAudio(url: string): HTMLAudioElement {
	let audio = builtInAudioByUrl.get(url);
	if (!audio) {
		audio = new Audio(url);
		audio.preload = "auto";
		builtInAudioByUrl.set(url, audio);
	}
	return audio;
}

function isUserGesturePlaybackError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.name === "NotAllowedError" ||
		error.message.includes("user gesture") ||
		error.message.includes("not allowed")
	);
}

export async function playRingtone(opts: PlayRingtoneOptions): Promise<void> {
	if (opts.muted) return;
	const volumePercent = Math.max(0, Math.min(100, opts.volume));
	const volume = volumePercent / 100;
	if (volume === 0) return;

	if (opts.ringtoneId === CUSTOM_RINGTONE_ID) {
		try {
			await electronTrpcClient.ringtone.playNotification.mutate({
				ringtoneId: opts.ringtoneId,
				volume: volumePercent,
			});
		} catch (error) {
			console.warn("[ringtone] custom playback failed:", error);
		}
		return;
	}

	const url = resolveRingtoneUrl(opts.ringtoneId);
	if (!url) return;

	const audio = getBuiltInAudio(url);
	audio.volume = volume;
	audio.currentTime = 0;

	try {
		await audio.play();
	} catch (error) {
		if (!isUserGesturePlaybackError(error)) {
			console.warn("[ringtone] playback failed:", error);
		}
	}
}
