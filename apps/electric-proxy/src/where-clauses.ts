interface WhereClause {
	fragment: string;
	params: string[];
	columns?: string;
}

export function buildWhereClause({
	table,
	organizationId,
	organizationIds,
}: {
	table: string;
	organizationId: string;
	organizationIds: string[];
}): WhereClause | null {
	switch (table) {
		case "tasks":
		case "task_statuses":
		case "repositories":
		case "auth.members":
		case "auth.invitations":
		case "device_presence":
		case "agent_commands":
		case "integration_connections":
			return {
				fragment: '"organization_id" = $1',
				params: [organizationId],
			};

		case "subscriptions":
			return {
				fragment: '"reference_id" = $1',
				params: [organizationId],
			};

		case "auth.apikeys":
			return {
				fragment: `"metadata"::jsonb->>'organizationId' = $1`,
				params: [organizationId],
				columns: "id,name,start,created_at,last_request",
			};

		case "auth.users":
			return {
				fragment: '$1 = ANY("organization_ids")',
				params: [organizationId],
			};

		case "auth.organizations": {
			if (organizationIds.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}
			const placeholders = organizationIds
				.map((_, i) => `$${i + 1}`)
				.join(", ");
			return {
				fragment: `"id" IN (${placeholders})`,
				params: organizationIds,
			};
		}

		default:
			return null;
	}
}
