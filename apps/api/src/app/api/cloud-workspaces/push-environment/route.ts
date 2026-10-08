import { pushEnvironmentToRunningWorkspaces } from "@superset/trpc/cloud-workspace-push-environment";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const payloadSchema = z
	.object({
		environmentId: z.string().uuid(),
		organizationId: z.string().uuid(),
	})
	.strict();

/** Pushes an environment's changed variables to the running boxes started from it. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/push-environment",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error(
			"[cloud-workspaces/push-environment] invalid payload",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await pushEnvironmentToRunningWorkspaces(parsed.data);
	return Response.json({ ok: true, ...outcome });
}
