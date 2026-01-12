import type { LinearClient } from "@linear/sdk";
import { buildConflictUpdateColumns } from "@superset/db";
import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import { calculateProgressForStates } from "./utils";

export async function syncWorkflowStates({
	client,
	organizationId,
}: {
	client: LinearClient;
	organizationId: string;
}): Promise<void> {
	const teams = await client.teams();

	for (const team of teams.nodes) {
		const states = await team.states();

		const statesByType = new Map<string, typeof states.nodes>();
		for (const state of states.nodes) {
			if (!statesByType.has(state.type)) {
				statesByType.set(state.type, []);
			}
			statesByType.get(state.type)?.push(state);
		}

		const startedStates = statesByType.get("started") || [];
		const progressMap = calculateProgressForStates(
			startedStates.map((s) => ({ name: s.name, position: s.position })),
		);

		const values = states.nodes.map((state) => ({
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
