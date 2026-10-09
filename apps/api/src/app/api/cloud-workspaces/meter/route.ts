import { meterCloudWorkspace } from "@superset/trpc/cloud-workspace-meter";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const payloadSchema = z
	.object({ cloudWorkspaceId: z.string().uuid() })
	.strict();

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/meter",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[cloud-workspaces/meter] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await meterCloudWorkspace(parsed.data.cloudWorkspaceId);
	return Response.json({ ok: true, ...outcome });
}
