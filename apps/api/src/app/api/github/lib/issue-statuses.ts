export interface TaskStatusCandidate {
	id: string;
	type: string;
	externalProvider: string | null;
}

export function pickPreferredStatusByType(
	statuses: TaskStatusCandidate[],
	type: string,
): TaskStatusCandidate | undefined {
	const matching = statuses.filter((status) => status.type === type);
	if (matching.length === 0) {
		return undefined;
	}

	return (
		matching.find((status) => status.externalProvider == null) ?? matching[0]
	);
}
