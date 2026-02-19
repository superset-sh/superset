import { sessionStateSchema } from "@superset/durable-session";
import { appendToStream, requireAuth } from "../../../lib";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const actorId = session.user.id;

	const body = (await request.json()) as {
		model?: string;
		permissionMode?: string;
		thinkingEnabled?: boolean;
		cwd?: string;
		availableModels?: Array<{ id: string; name: string; provider: string }>;
		slashCommands?: Array<{
			name: string;
			description: string;
			argumentHint: string;
		}>;
		title?: string;
	};

	const messageId = crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "config",
				...body,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	await appendToStream(sessionId, JSON.stringify(event));

	return Response.json({ success: true }, { status: 200 });
}
