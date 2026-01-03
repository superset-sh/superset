import { env } from "renderer/env.renderer";
import type { PGliteWithExtensions } from "./database";

const SYNCED_TABLES = [
	"users",
	"organizations",
	"organization_members",
	"tasks",
] as const;

export async function startSync(
	pg: PGliteWithExtensions,
	accessToken: string,
	organizationId: string,
) {
	const baseUrl = `${env.NEXT_PUBLIC_API_URL}/api/electric/v1/shape`;

	const shapes = Object.fromEntries(
		SYNCED_TABLES.map((table) => [
			table,
			{
				shape: {
					url: baseUrl,
					params: { table, organizationId },
					headers: { Authorization: `Bearer ${accessToken}` },
				},
				table,
				primaryKey: ["id"],
			},
		]),
	);

	return pg.sync.syncShapesToTables({
		shapes,
		key: `superset-sync-${organizationId}`,
	});
}
