import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	getRingtoneById,
} from "shared/ringtones";
import { builtInRingtoneUrls } from "./urls";

export interface PlayRingtoneOptions {
	ringtoneId: string;
	/** 0..100 — matches the existing `notificationVolume` setting shape. */
	volume: number;
	muted: boolean;
}

let audioPrimed = false;
let audioPrimingListenersInstalled = false;

/**
 * Some browsers block `audio.play()` until the user has interacted with the
 * page. Wire this up once at app mount so the first pointerdown unlocks
 * autoplay and subsequent hook events can play without a visible gesture.
 * Safe to call repeatedly — listeners are only installed once.
 */
export function primeRingtoneAudioOnFirstGesture(): void {
	if (audioPrimed || typeof window === "undefined") return;
	if (audioPrimingListenersInstalled) return;
	audioPrimingListenersInstalled = true;

	const removeListeners = () => {
		window.removeEventListener("pointerdown", prime);
		window.removeEventListener("keydown", prime);
	};

	const prime = () => {
		const silent = new Audio();
		silent.muted = true;
		silent
			.play()
			.then(() => {
				audioPrimed = true;
				removeListeners();
			})
			.catch(() => {
				// Browser refused even with a gesture — wait for the next one.
				// Listeners stay active (once:true triggered, so re-attach).
				audioPrimingListenersInstalled = false;
				window.addEventListener("pointerdown", prime, { once: true });
				window.addEventListener("keydown", prime, { once: true });
				audioPrimingListenersInstalled = true;
			});
	};

	window.addEventListener("pointerdown", prime, { once: true });
	window.addEventListener("keydown", prime, { once: true });
}

/**
 * Resolve the bundled audio URL for a ringtone id. Returns null for the
 * custom-ringtone id (handled separately via host-service upload — not
 * part of this MVP) and for unknown ids that aren't the default.
 */
function resolveRingtoneUrl(ringtoneId: string): string | null {
	if (ringtoneId === CUSTOM_RINGTONE_ID) {
		// Custom uploads aren't wired into renderer playback yet — fall back
		// to the default so muted is the only way to get silence in v2.
		return (
			builtInRingtoneUrls[
				getRingtoneById(DEFAULT_RINGTONE_ID)?.filename ?? ""
			] ?? null
		);
	}
	const ringtone = getRingtoneById(ringtoneId);
	if (ringtone && builtInRingtoneUrls[ringtone.filename]) {
		return builtInRingtoneUrls[ringtone.filename] ?? null;
	}
	const fallback = getRingtoneById(DEFAULT_RINGTONE_ID);
	return fallback ? (builtInRingtoneUrls[fallback.filename] ?? null) : null;
}

export async function playRingtone(opts: PlayRingtoneOptions): Promise<void> {
	if (opts.muted) return;
	const volume = Math.max(0, Math.min(1, opts.volume / 100));
	if (volume === 0) return;

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
