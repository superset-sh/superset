import { v1MigrationState } from "@superset/local-db";
import { and, eq, inArray } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

/** v1 workspaces some org already has in v2, from the migration ledger. */
export function readMigratedV1WorkspaceIds(): Set<string> {
	return new Set(
		localDb
			.select({ v1Id: v1MigrationState.v1Id })
			.from(v1MigrationState)
			.where(
				and(
					eq(v1MigrationState.kind, "workspace"),
					inArray(v1MigrationState.status, ["success", "linked"]),
				),
			)
			.all()
			.map((row) => row.v1Id),
	);
}
