interface TaskWithLinearProject {
	externalProjectId: string | null;
}

export function filterTasksByLinearScope<T extends TaskWithLinearProject>(
	tasks: T[],
	initiativeProjectIds: readonly string[] | null,
	projectId: string | null,
): T[] {
	let result = tasks;

	if (initiativeProjectIds !== null) {
		const allowedProjectIds = new Set(initiativeProjectIds);
		result = result.filter(
			(task) =>
				task.externalProjectId !== null &&
				allowedProjectIds.has(task.externalProjectId),
		);
	}

	if (projectId) {
		result = result.filter((task) => task.externalProjectId === projectId);
	}

	return result;
}

export function linearInitiativeProjectIdsKey(
	projectIds: readonly string[] | null,
): string {
	return projectIds === null ? "*" : projectIds.join(",");
}
