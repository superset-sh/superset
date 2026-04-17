// Chromium's Keyboard Map API tells us how each physical key is labeled on
// the active layout. Used to gate the Mac Option dead-key rewrites in
// sanitizeOverride — on non-US layouts, Option+<letter> produces different
// glyphs than US (e.g., German Option+Q = •), so our US-based rewrite table
// would produce wrong bindings.
//
// Fallback is optimistic (returns `true`) because:
// - `navigator.keyboard` is gated on secure contexts; packaged Electron
//   renderers on file:// won't expose it, and we'd rather rewrite than drop
//   for the common case.
// - Non-Mac users are unaffected either way (the dead-key glyphs aren't
//   typeable at all, so detection is moot).

interface KeyboardLayoutMap extends ReadonlyMap<string, string> {}
interface Keyboard {
	getLayoutMap?: () => Promise<KeyboardLayoutMap>;
}

let cached: Promise<boolean> | null = null;

export function isUSCompatibleLayout(): Promise<boolean> {
	if (cached) return cached;
	cached = probe();
	return cached;
}

async function probe(): Promise<boolean> {
	const keyboard = (navigator as Navigator & { keyboard?: Keyboard }).keyboard;
	if (!keyboard?.getLayoutMap) return true;
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
		return true;
	}
}

// Exposed for tests — resets the cached probe result.
export function resetUSLayoutCacheForTests(): void {
	cached = null;
}
