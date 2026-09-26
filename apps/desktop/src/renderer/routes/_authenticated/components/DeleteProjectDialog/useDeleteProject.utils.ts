export interface ProjectDeletionTarget {
	hostId: string;
	name: string;
	url: string | null;
	isLocal: boolean;
	isOnline: boolean;
	canDelete: boolean;
}

export function defaultProjectDeletionSelection(
	targets: ProjectDeletionTarget[],
): string[] {
	const available = targets.filter((target) => target.canDelete);
	const local = available.find((target) => target.isLocal);
	if (local) return [local.hostId];
	const only = available[0];
	return available.length === 1 && only ? [only.hostId] : [];
}

export function selectedProjectDeletionTargets(
	targets: ProjectDeletionTarget[],
	selectedHostIds: string[],
) {
	return targets.filter(
		(target): target is ProjectDeletionTarget & { url: string } =>
			target.url !== null &&
			target.isOnline &&
			target.canDelete &&
			selectedHostIds.includes(target.hostId),
	);
}
