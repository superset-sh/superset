import type { LinearClient } from "@linear/sdk";
import { buildConflictUpdateColumns } from "@superset/db";
import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import { calculateProgressForStates } from "./utils";

/**
 * Normalizes Linear's state type to our preferred US spelling
 */
function normalizeStateType(linearType: string): string {
	if (linearType === "canceled") {
		return "cancelled";
	}
	return linearType;
}

export async function syncWorkflowStates({
	client,
	organizationId,
}: {
	client: LinearClient;
	organizationId: string;
}): Promise<void> {
	console.log("[syncWorkflowStates] Fetching teams");

	const teams = await client.teams();

	for (const team of teams.nodes) {
		console.log(`[syncWorkflowStates] Processing team: ${team.name}`);

		const states = await team.states();

		// Group by type for progress calculation
		const statesByType = new Map<string, typeof states.nodes>();
		for (const state of states.nodes) {
			if (!statesByType.has(state.type)) {
				statesByType.set(state.type, []);
			}
			statesByType.get(state.type)?.push(state);
		}

		// Calculate progress for "started" type
		const startedStates = statesByType.get("started") || [];
		const progressMap = calculateProgressForStates(
			startedStates.map((s) => ({ name: s.name, position: s.position })),
		);

		// Prepare insert values
		const values = states.nodes.map((state) => ({
			organizationId,
			name: state.name,
			color: state.color,
			type: normalizeStateType(state.type),
			position: state.position,
			progressPercent:
				state.type === "started" ? (progressMap.get(state.name) ?? null) : null,
			externalProvider: "linear" as const,
			externalId: state.id,
		}));

		// Upsert workflow states
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

		console.log(
			`[syncWorkflowStates] Synced ${values.length} states for team ${team.name}`,
		);
	}
}
