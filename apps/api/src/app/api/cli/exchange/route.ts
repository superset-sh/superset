import { auth } from "@superset/auth/server";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

export async function POST(req: Request) {
	const body = (await req.json()) as { code?: string };
	const code = body.code;
	if (!code) {
		return Response.json({ error: "code required" }, { status: 400 });
	}

	const key = `cli:code:${code}`;
	const value = await redis.get<string>(key);
	if (!value) {
		return Response.json({ error: "Invalid or expired code" }, { status: 400 });
	}

	await redis.del(key);

	const [userId, organizationId] = value.split(":");
	if (!userId || !organizationId) {
		return Response.json({ error: "Malformed code data" }, { status: 500 });
	}

	const context = await auth.$context;
	const session = await context.internalAdapter.createSession(userId, false, {
		activeOrganizationId: organizationId,
	});
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
