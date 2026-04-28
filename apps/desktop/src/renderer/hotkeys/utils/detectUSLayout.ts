// Chromium's Keyboard Map API tells us how each physical key is labeled on
// the active layout. Used to gate the Mac Option dead-key rewrites in
// sanitizeOverride — on non-US layouts, Option+<letter> produces different
// glyphs than US (e.g., German Option+Q = •), so our US-based rewrite table
// would produce wrong bindings.
//
// Fail-closed: when the API is unavailable (packaged Electron file:// often
// hides it) or throws, return "unknown" so callers can refuse to apply the
// US-Mac dead-key rewrites instead of silently rebinding to the wrong key.
// Phase 1 replaces this entirely with native-keymap from the main process.

interface KeyboardLayoutMap extends ReadonlyMap<string, string> {}
interface Keyboard {
	getLayoutMap?: () => Promise<KeyboardLayoutMap>;
}

export type USLayoutResult = boolean | "unknown";

let cached: Promise<USLayoutResult> | null = null;

export function isUSCompatibleLayout(): Promise<USLayoutResult> {
	if (cached) return cached;
	cached = probe();
	return cached;
}

async function probe(): Promise<USLayoutResult> {
	const keyboard = (navigator as Navigator & { keyboard?: Keyboard }).keyboard;
	if (!keyboard?.getLayoutMap) return "unknown";
	try {
		const map = await keyboard.getLayoutMap();
		return (
			map.get("KeyA") === "a" &&
			map.get("KeyQ") === "q" &&
			map.get("KeyW") === "w" &&
			map.get("KeyZ") === "z" &&
			map.get("Semicolon") === ";" &&
			map.get("Quote") === "'"
		);
	} catch {
		return "unknown";
	}
}

// Exposed for tests — resets the cached probe result.
export function resetUSLayoutCacheForTests(): void {
	cached = null;
}
