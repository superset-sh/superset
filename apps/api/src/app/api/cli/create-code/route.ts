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

function generateCode(): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let code = "";
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	for (const byte of bytes) code += chars[byte % chars.length];
	return code;
}

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session) {
		return Response.json({ error: "Not authenticated" }, { status: 401 });
	}

	const body = (await req.json()) as { organizationId?: string };
	const organizationId = body.organizationId;
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

	const code = generateCode();
	await redis.set(`cli:code:${code}`, `${session.user.id}:${organizationId}`, {
		ex: 300,
	});

	return Response.json({ code });
}
