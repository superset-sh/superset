import { initialProjectFocusId } from "renderer/lib/project-focus";

/**
 * Returns the `projectFocus` ID if this window was opened in project-focus mode.
 *
 * The value is captured at module load time (before the router replaces the hash)
 * from the initial URL: `#/?projectFocus=abc123`.
 */
export function useProjectFocus(): string | null {
	return initialProjectFocusId;
}
