import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import { organizationSyncs } from "@superset/trpc/sync-policy";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { reconcileGitlabHooks } from "../../reconcile-hooks";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const bodySchema = z.object({ connectionId: z.string().uuid().optional() });
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/gitlab/jobs/reconcile-hooks",
	);
	if (rejected) return rejected;
	let json: unknown = {};
	if (body) {
		try {
			json = JSON.parse(body);
		} catch {
			return Response.json({ error: "Invalid JSON" }, { status: 400 });
		}
	}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success)
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	const rows = await db
		.select({ id: connections.id, organizationId: connections.organizationId })
		.from(connections)
		.where(
			and(
				eq(connections.connector, "gitlab"),
				eq(connections.ownerKind, "org"),
				isNull(connections.disconnectedAt),
				organizationSyncs(connections.organizationId),
				...(parsed.data.connectionId
					? [eq(connections.id, parsed.data.connectionId)]
					: []),
				sql`coalesce(${connections.state}->>'scopeKind', 'project') in ('project', 'group')`,
			),
		);
	const results = [];
	for (const row of rows) {
		try {
			results.push({
				connectionId: row.id,
				...(await reconcileGitlabHooks({
					connectionId: row.id,
					organizationId: row.organizationId,
				})),
			});
		} catch {
			results.push({
				connectionId: row.id,
				status: "failed",
				error: "reconcile_failed",
			});
		}
	}
	return Response.json({ connections: rows.length, results });
}
