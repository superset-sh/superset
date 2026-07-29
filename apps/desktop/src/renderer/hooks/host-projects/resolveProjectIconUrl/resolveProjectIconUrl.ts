/**
 * Resolve the icon URL to display for a project: a custom local-first icon
 * (data-URI, set in project settings) wins; otherwise fall back to the linked
 * GitHub owner's avatar; otherwise none (callers render a placeholder).
 *
 * This is the single source of truth for project-icon display — every surface
 * (sidebar, settings, pickers, workspace lists) must go through it so a custom
 * icon shows everywhere, not just where it was set.
 */
export function resolveProjectIconUrl(project: {
	icon: string | null;
	repoOwner: string | null;
}): string | null {
	if (project.icon) return project.icon;
	if (project.repoOwner) {
		return `https://github.com/${project.repoOwner}.png?size=64`;
	}
	return null;
}
