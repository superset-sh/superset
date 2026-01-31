import { auth } from "@superset/auth/server";
import type { McpContext } from "@superset/mcp/auth";
import { runVoicePipeline } from "./voice-service";

async function authenticate(request: Request): Promise<McpContext | null> {
	// Try session auth
	const session = await auth.api.getSession({ headers: request.headers });
	if (session?.session) {
		const extendedSession = session.session as {
			activeOrganizationId?: string;
		};
		if (!extendedSession.activeOrganizationId) {
			return null;
		}
		return {
			userId: session.user.id,
			organizationId: extendedSession.activeOrganizationId,
		};
	}

	return null;
}

export async function POST(request: Request) {
	// 1. Authenticate
	const ctx = await authenticate(request);
	if (!ctx) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	// 2. Parse multipart form data
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return Response.json(
			{ error: "Expected multipart form data with audio file" },
			{ status: 400 },
		);
	}

	const audioFile = formData.get("audio");
	if (!audioFile || !(audioFile instanceof File)) {
		return Response.json(
			{ error: "Missing 'audio' file in form data" },
			{ status: 400 },
		);
	}

	const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5 MB
	if (audioFile.size > MAX_AUDIO_SIZE) {
		return Response.json(
			{ error: "Audio file too large (max 5 MB)" },
			{ status: 413 },
		);
	}

	const audioBuffer = new Uint8Array(await audioFile.arrayBuffer());

	// 3. Stream SSE response
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const sse = {
				write(event: string, data: unknown) {
					const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(payload));
				},
			};

			try {
				await runVoicePipeline({ audioBuffer, ctx, sse });
			} catch (error) {
				console.error("[voice/route] Pipeline error:", error);
				sse.write("error", {
					message:
						error instanceof Error ? error.message : "Voice pipeline failed",
				});
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
