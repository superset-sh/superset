declare global {
	interface Window {
		rdt?: (...args: unknown[]) => void;
	}
}

/** Unique id so Reddit can dedupe a conversion sent more than once. */
function generateConversionId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Fire a Reddit Pixel conversion event. No-ops on the server or before the
 * base pixel (injected in the root layout) has defined `window.rdt`. Reddit
 * standard events include "PageVisit", "Lead", "SignUp", and "Purchase".
 *
 * A unique `conversionId` is attached for deduplication; pass an explicit
 * `conversionId` in `properties` to override (e.g. to match a server-side
 * Conversions API call for the same conversion).
 */
export function trackReddit(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (typeof window === "undefined" || typeof window.rdt !== "function") {
		return;
	}

	// Best-effort: a throw from the third-party pixel must never escape into the
	// caller (e.g. a download click handler that navigates right after).
	try {
		window.rdt("track", event, {
			conversionId: generateConversionId(),
			...properties,
		});
	} catch (error) {
		console.warn("Reddit Pixel track failed", error);
	}
}
