import { reapArchivedCloudWorkspace } from "@superset/trpc/cloud-workspace-reap";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const payloadSchema = z
	.object({
		cloudWorkspaceId: z.string().uuid(),
		archivedAt: z.string().datetime(),
	})
	.strict();

/** Deletes an archived workspace's stopped box once its grace period is over. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/reap",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[cloud-workspaces/reap] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await reapArchivedCloudWorkspace(parsed.data);
	return Response.json({ ok: true, outcome });
}
