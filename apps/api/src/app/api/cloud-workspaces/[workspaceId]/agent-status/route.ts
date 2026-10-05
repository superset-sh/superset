import { ACTIVE_AGENT_STATUSES } from "@superset/shared/agent-status";
import { reportSandboxAgentStatus } from "@superset/trpc/lib/sandbox";
import { z } from "zod";

const bodySchema = z.object({
	status: z.enum(ACTIVE_AGENT_STATUSES).nullable(),
	at: z.number().int().positive(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
	const { workspaceId } = await params;
	const presented = request.headers
		.get("authorization")
		?.replace(/^Bearer\s+/i, "");
	if (!presented || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	const outcome = await reportSandboxAgentStatus({
		workspaceId,
		presentedSecret: presented,
		status: parsed.data.status,
		at: parsed.data.at,
	});
	if (outcome === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (outcome === "unknown") {
		return Response.json({ error: "unknown workspace" }, { status: 404 });
	}
	return Response.json({ ok: true });
}
