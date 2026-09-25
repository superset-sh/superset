export type ProjectForPlacement = {
	projectKey: string;
	/** Hosts that serve this project. */
	hostIds: readonly string[];
};

/**
 * Chooses which host-served projects the sidebar reconciler should place.
 * Kept free of React so it can be unit-tested directly.
 *
 * A project appears in the sidebar because it exists on this device, not
 * because of any workspace it may or may not have: a project with zero
 * workspaces is still a project. Only projects this device's host serves
 * qualify — a remote host's projects are a shared roster, and placing them
 * would pin every teammate's project on every machine.
 *
 * "Placed once, then respected": a present placement row means "already
 * seen". Hiding keeps the row with `isHidden`, so a hidden project is never
 * re-placed; only a genuinely row-less project is added.
 */
export function selectProjectsToPlace(
	projects: readonly ProjectForPlacement[],
	placedProjectIds: ReadonlySet<string>,
	machineId: string | null,
): string[] {
	if (machineId === null) return [];
	return projects
		.filter(
			(project) =>
				!placedProjectIds.has(project.projectKey) &&
				project.hostIds.includes(machineId),
		)
		.map((project) => project.projectKey);
}
