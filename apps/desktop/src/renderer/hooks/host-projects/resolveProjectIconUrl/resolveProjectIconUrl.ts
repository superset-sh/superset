/**
 * Sentinel stored in the host `icon` column meaning "explicitly no icon":
 * suppresses the GitHub avatar fallback so surfaces render the letter tile
 * (v1's hide_image equivalent). Null means "default" (avatar when linked).
 */
export const PROJECT_ICON_NONE = "none";

/**
 * Resolve the icon URL to display for a project: a custom local-first icon
 * (data-URI, set in project settings) wins; the "none" sentinel suppresses
 * every image so callers render the letter placeholder; otherwise fall back
 * to the linked GitHub owner's avatar; otherwise none.
 *
 * This is the single source of truth for project-icon display — every surface
 * (sidebar, settings, pickers, workspace lists) must go through it so a custom
 * icon shows everywhere, not just where it was set.
 */
export function resolveProjectIconUrl(project: {
	icon: string | null;
	repoOwner: string | null;
}): string | null {
	if (project.icon === PROJECT_ICON_NONE) return null;
	if (project.icon) return project.icon;
	if (project.repoOwner) {
		return `https://github.com/${project.repoOwner}.png?size=64`;
	}
	return null;
}
