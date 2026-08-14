import type { LinearClient } from "@linear/sdk";

interface LinearConnection<T> {
	nodes: T[];
	pageInfo: { hasNextPage: boolean };
	fetchNext: () => Promise<LinearConnection<T>>;
}

interface LinearInitiative {
	id: string;
	name: string;
	trashed?: boolean | null;
}

interface LinearInitiativeToProject {
	initiativeId?: string;
	projectId?: string;
}

export interface LinearInitiativeProjects {
	id: string;
	name: string;
	projectIds: string[];
}

async function fetchAllNodes<T>(
	connectionPromise: Promise<LinearConnection<T>>,
): Promise<T[]> {
	const connection = await connectionPromise;
	while (connection.pageInfo.hasNextPage) {
		await connection.fetchNext();
	}
	return connection.nodes;
}

export function buildLinearInitiativeProjects(
	initiatives: LinearInitiative[],
	relations: LinearInitiativeToProject[],
): LinearInitiativeProjects[] {
	const projectIdsByInitiative = new Map<string, Set<string>>();
	for (const relation of relations) {
		if (!relation.initiativeId || !relation.projectId) continue;
		const projectIds = projectIdsByInitiative.get(relation.initiativeId);
		if (projectIds) {
			projectIds.add(relation.projectId);
		} else {
			projectIdsByInitiative.set(
				relation.initiativeId,
				new Set([relation.projectId]),
			);
		}
	}

	return initiatives
		.filter((initiative) => !initiative.trashed)
		.map((initiative) => ({
			id: initiative.id,
			name: initiative.name,
			projectIds: [...(projectIdsByInitiative.get(initiative.id) ?? [])],
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLinearInitiativeProjects(
	client: LinearClient,
): Promise<LinearInitiativeProjects[]> {
	const [initiatives, relations] = await Promise.all([
		fetchAllNodes(client.initiatives({ first: 250, includeArchived: false })),
		fetchAllNodes(
			client.initiativeToProjects({ first: 250, includeArchived: false }),
		),
	]);

	return buildLinearInitiativeProjects(initiatives, relations);
}
