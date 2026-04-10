import { auth } from "@superset/auth/server";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

interface CodePayload {
	userId: string;
	organizationId: string;
}

export async function POST(request: Request) {
	const body = (await request.json()) as { code?: string };
	const { code } = body;
	if (!code) {
		return Response.json({ error: "code required" }, { status: 400 });
	}

	const key = `cli:code:${code}`;
	const payload = await redis.get<CodePayload>(key);
	if (!payload) {
		return Response.json({ error: "Invalid or expired code" }, { status: 400 });
	}

	await redis.del(key);

	if (!payload.userId || !payload.organizationId) {
		return Response.json({ error: "Malformed code data" }, { status: 500 });
	}

	const context = await auth.$context;
	const session = await context.internalAdapter.createSession(
		payload.userId,
		false,
		{ activeOrganizationId: payload.organizationId },
	);
	if (!session) {
		return Response.json(
			{ error: "Failed to create session" },
			{ status: 500 },
		);
	}

	return Response.json({
		token: session.token,
		expiresAt: session.expiresAt.toISOString(),
	});
}
