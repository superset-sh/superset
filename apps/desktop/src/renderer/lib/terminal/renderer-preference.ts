export type TerminalRendererType = "webgl" | "dom";

export const TERMINAL_RENDERER_PREFERENCE_KEY = "terminal-renderer-type";

function isRendererType(value: string | null): value is TerminalRendererType {
	return value === "webgl" || value === "dom";
}

/**
 * Read the user's terminal renderer preference from localStorage.
 *
 * Returns "dom" to force the DOM renderer (escape hatch for WebGL texture
 * atlas corruption seen on some GPU/driver combinations), "webgl" to force
 * WebGL, or undefined to let the loader pick (WebGL with DOM fallback).
 */
export function getTerminalRendererPreference():
	| TerminalRendererType
	| undefined {
	try {
		const value = localStorage.getItem(TERMINAL_RENDERER_PREFERENCE_KEY);
		if (isRendererType(value)) {
			return value;
		}
	} catch {
		// localStorage unavailable in some contexts
	}
	return undefined;
}
