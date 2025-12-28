import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { db } from "@superset/db/client";
import { organizationMembers, users } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { authenticateRequest } from "@/lib/auth";
import { buildWhereClause } from "./utils";

/**
 * Electric SQL Proxy
 *
 * Forwards shape requests to Electric with organization-based filtering.
 * @see https://electric-sql.com/docs/guides/auth#proxy-auth
 */
export async function GET(request: Request): Promise<Response> {
	const clerkUserId = await authenticateRequest(request);
	if (!clerkUserId) {
		return new Response("Unauthorized", { status: 401 });
	}

	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});
	if (!user) {
		return new Response("User not found", { status: 401 });
	}

	// Get the requested organization ID from query params
	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");
	if (!organizationId) {
		return new Response("Missing organizationId parameter", { status: 400 });
	}

	// Verify user is a member of this organization
	const membership = await db.query.organizationMembers.findFirst({
		where: and(
			eq(organizationMembers.userId, user.id),
			eq(organizationMembers.organizationId, organizationId),
		),
	});
	if (!membership) {
		return new Response("Not a member of this organization", { status: 403 });
	}

	const originUrl = new URL(env.ELECTRIC_URL);
	originUrl.searchParams.set("secret", env.ELECTRIC_SECRET);

	url.searchParams.forEach((value, key) => {
		if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
			originUrl.searchParams.set(key, value);
		}
	});

	const tableName = url.searchParams.get("table");
	if (!tableName) {
		return new Response("Missing table parameter", { status: 400 });
	}

	const whereClause = await buildWhereClause(tableName, organizationId);
	if (!whereClause) {
		return new Response(`Unknown table: ${tableName}`, { status: 400 });
	}

	originUrl.searchParams.set("table", tableName);
	originUrl.searchParams.set("where", whereClause.fragment);
	whereClause.params.forEach((value, index) => {
		originUrl.searchParams.set(`params[${index + 1}]`, String(value));
	});

	// Forward to Electric
	const response = await fetch(originUrl.toString());

	// Forward headers, but remove content-encoding/length per Electric docs
	// (these can cause issues when proxying compressed responses)
	const headers = new Headers();
	response.headers.forEach((value, key) => {
		const lower = key.toLowerCase();
		if (lower !== "content-encoding" && lower !== "content-length") {
			headers.set(key, value);
		}
	});

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
