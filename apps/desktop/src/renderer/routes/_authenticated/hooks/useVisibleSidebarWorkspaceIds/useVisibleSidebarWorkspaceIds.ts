import { useSidebarVisibility } from "renderer/routes/_authenticated/providers/SidebarVisibilityProvider";

/**
 * The set of workspace ids currently rendered in the v2 dashboard sidebar, used
 * to gate ports and notifications so they match exactly what the user sees.
 *
 * Backed by {@link useSidebarVisibility}: a single shared computation, so ports,
 * notifications, and the sidebar tree cannot drift apart.
 */
export function useVisibleSidebarWorkspaceIds(): ReadonlySet<string> {
	return useSidebarVisibility().visibleWorkspaceIds;
}
