import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { processAgentCompletion } from "../../events/process-agent-completion";
import { COMPLETION_JOB_PATH } from "../../events/utils/agent-launches";

export const maxDuration = 60;

const payloadSchema = z.object({ launchId: z.string().uuid() });

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		COMPLETION_JOB_PATH,
	);
	if (rejected) return rejected;

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}
	const parsed = payloadSchema.safeParse(payload);
	if (!parsed.success) {
		console.error("[slack/agent-completion] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	await processAgentCompletion(parsed.data);
	return Response.json({ success: true });
}
