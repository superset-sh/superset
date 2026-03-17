import { useMemo } from "react";

/**
 * Reads the `projectFocus` query param from `window.location.hash`.
 * When set, the renderer should show only the specified project in the sidebar.
 *
 * The hash URL looks like: `#/?projectFocus=abc123` (dev) or `#/?projectFocus=abc123` (prod).
 */
export function useProjectFocus(): string | null {
	return useMemo(() => {
		const hash = window.location.hash; // e.g. "#/?projectFocus=abc123"
		const qIndex = hash.indexOf("?");
		if (qIndex === -1) return null;
		const params = new URLSearchParams(hash.slice(qIndex));
		return params.get("projectFocus");
	}, []);
}
