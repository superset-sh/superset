import { randomBytes } from "node:crypto";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { Redis } from "@upstash/redis";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return Response.json({ error: "Not authenticated" }, { status: 401 });
	}

	const body = (await request.json()) as { organizationId?: string };
	const { organizationId } = body;
	if (!organizationId) {
		return Response.json({ error: "organizationId required" }, { status: 400 });
	}

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.userId, session.user.id),
			eq(members.organizationId, organizationId),
		),
	});
	if (!membership) {
		return Response.json(
			{ error: "Not a member of this organization" },
			{ status: 403 },
		);
	}

	const code = randomBytes(24).toString("base64url");
	await redis.set(
		`cli:code:${code}`,
		{ userId: session.user.id, organizationId },
		{ ex: 300 },
	);

	return Response.json({ code });
}
