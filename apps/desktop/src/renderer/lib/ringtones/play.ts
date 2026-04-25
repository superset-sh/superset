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

let audioPrimed = false;
let audioPrimingListenersInstalled = false;
let audioPrimingInFlight = false;

/**
 * Some browsers block `audio.play()` until the user has interacted with the
 * page. Wire this up once at app mount so the first pointerdown unlocks
 * autoplay and subsequent hook events can play without a visible gesture.
 * Safe to call repeatedly — listeners are only installed once.
 */
export function primeRingtoneAudioOnFirstGesture(): void {
	if (audioPrimed || typeof window === "undefined") return;
	if (audioPrimingListenersInstalled || audioPrimingInFlight) return;

	const removeListeners = () => {
		window.removeEventListener("pointerdown", prime);
		window.removeEventListener("keydown", prime);
		audioPrimingListenersInstalled = false;
	};

	const installListeners = () => {
		if (audioPrimed || audioPrimingListenersInstalled || audioPrimingInFlight) {
			return;
		}
		window.addEventListener("pointerdown", prime, { once: true });
		window.addEventListener("keydown", prime, { once: true });
		audioPrimingListenersInstalled = true;
	};

	const prime = () => {
		if (audioPrimed || audioPrimingInFlight) return;
		audioPrimingInFlight = true;
		removeListeners();

		const silent = new Audio();
		silent.muted = true;
		silent
			.play()
			.then(() => {
				audioPrimed = true;
				audioPrimingInFlight = false;
			})
			.catch(() => {
				// Browser refused even with a gesture — wait for the next one.
				audioPrimingInFlight = false;
				installListeners();
			});
	};

	installListeners();
}

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

	const audio = new Audio(url);
	audio.volume = volume;

	try {
		await audio.play();
	} catch (error) {
		console.warn("[ringtone] autoplay blocked or failed:", error);
	}
}
