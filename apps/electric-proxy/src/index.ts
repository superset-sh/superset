import { verifyJWT } from "./auth";
import { buildUpstreamUrl } from "./electric";
import type { Env } from "./types";
import { buildWhereClause } from "./where";

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Expose-Headers":
		"electric-handle, electric-offset, electric-schema, electric-up-to-date, electric-cursor",
};

function corsResponse(status: number, body: string): Response {
	return new Response(body, { status, headers: CORS_HEADERS });
}

function addCorsHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	if (headers.get("content-encoding")) {
		headers.delete("content-encoding");
		headers.delete("content-length");
	}
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		headers.set(key, value);
	}
	headers.set("Vary", "Authorization");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (request.method !== "GET") {
			return corsResponse(405, "Method not allowed");
		}

		const authHeader = request.headers.get("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return corsResponse(401, "Missing or invalid Authorization header");
		}

		const token = authHeader.slice(7);
		const auth = await verifyJWT(token, env.AUTH_URL);
		if (!auth) {
			return corsResponse(401, "Invalid or expired token");
		}

		const url = new URL(request.url);

		const tableName = url.searchParams.get("table");
		if (!tableName) {
			return corsResponse(400, "Missing table parameter");
		}

		const organizationId = url.searchParams.get("organizationId");

		if (tableName !== "auth.organizations") {
			if (!organizationId) {
				return corsResponse(400, "Missing organizationId parameter");
			}
			if (!auth.organizationIds.includes(organizationId)) {
				return corsResponse(403, "Not a member of this organization");
			}
		}

		const authorizedOrganizationIds = [...auth.organizationIds].sort();
		const whereClause = buildWhereClause(
			tableName,
			organizationId ?? "",
			authorizedOrganizationIds,
		);
		if (!whereClause) {
			return corsResponse(400, `Unknown table: ${tableName}`);
		}

		const upstreamUrl = buildUpstreamUrl(url, tableName, whereClause, env);
		const upstreamHeaders = new Headers(request.headers);
		upstreamHeaders.delete("Authorization");
		upstreamHeaders.delete("Cookie");

		const response = await fetch(upstreamUrl.toString(), {
			headers: upstreamHeaders,
			cf: { cacheEverything: true },
		});

		return addCorsHeaders(response);
	},
} satisfies ExportedHandler<Env>;
