import { sessionStateSchema } from "@superset/chat/schema";
import { appendToStream, requireAuth } from "../../../lib";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const actorId = session.user.id;

	const body = (await request.json()) as
		| {
				tool: string;
				toolCallId: string;
				output: unknown;
				state?: "output-available";
		  }
		| {
				tool: string;
				toolCallId: string;
				state: "output-error";
				errorText: string;
		  };

	if (!body?.tool || !body?.toolCallId) {
		return Response.json(
			{ error: "tool and toolCallId are required" },
			{ status: 400 },
		);
	}

	if (
		body.state === "output-error" &&
		(typeof body.errorText !== "string" || body.errorText.trim().length === 0)
	) {
		return Response.json({ error: "errorText is required" }, { status: 400 });
	}

	const messageId = crypto.randomUUID();
	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "tool-output",
				tool: body.tool,
				toolCallId: body.toolCallId,
				state: body.state ?? "output-available",
				...("output" in body ? { output: body.output } : {}),
				...("errorText" in body ? { errorText: body.errorText } : {}),
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	await appendToStream(sessionId, JSON.stringify(event));
	return Response.json({ messageId }, { status: 200 });
}
