import type { LinearClient, Team, WorkflowState } from "@linear/sdk";
import { buildConflictUpdateColumns } from "@superset/db";
import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import { calculateProgressForStates } from "./utils";

async function fetchAllTeams(client: LinearClient): Promise<Team[]> {
	let connection = await client.teams();
	const allTeams = [...connection.nodes];
	while (connection.pageInfo.hasNextPage) {
		connection = await connection.fetchNext();
		allTeams.push(...connection.nodes);
	}
	return allTeams;
}

async function fetchAllStates(team: Team): Promise<WorkflowState[]> {
	let connection = await team.states();
	const allStates = [...connection.nodes];
	while (connection.pageInfo.hasNextPage) {
		connection = await connection.fetchNext();
		allStates.push(...connection.nodes);
	}
	return allStates;
}

export async function syncWorkflowStates({
	client,
	organizationId,
}: {
	client: LinearClient;
	organizationId: string;
}): Promise<void> {
	const allTeams = await fetchAllTeams(client);

	for (const team of allTeams) {
		const allStates = await fetchAllStates(team);

		const statesByType = new Map<string, WorkflowState[]>();
		for (const state of allStates) {
			if (!statesByType.has(state.type)) {
				statesByType.set(state.type, []);
			}
			statesByType.get(state.type)?.push(state);
		}

		const startedStates = statesByType.get("started") || [];
		const progressMap = calculateProgressForStates(
			startedStates.map((s) => ({ name: s.name, position: s.position })),
		);

		const values = allStates.map((state) => ({
			organizationId,
			name: state.name,
			color: state.color,
			type: state.type,
			position: state.position,
			progressPercent:
				state.type === "started" ? (progressMap.get(state.name) ?? null) : null,
			externalProvider: "linear" as const,
			externalId: state.id,
		}));

		if (values.length > 0) {
			await db
				.insert(taskStatuses)
				.values(values)
				.onConflictDoUpdate({
					target: [
						taskStatuses.organizationId,
						taskStatuses.externalProvider,
						taskStatuses.externalId,
					],
					set: {
						...buildConflictUpdateColumns(taskStatuses, [
							"name",
							"color",
							"type",
							"position",
							"progressPercent",
						]),
						updatedAt: new Date(),
					},
				});
		}
	}
}
