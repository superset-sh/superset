import { verifyJWT } from "./auth";
import { buildWhereClause } from "./where-clauses";

export interface Env {
	JWKS_URL: string;
	JWT_ISSUER: string;
	JWT_AUDIENCE: string;
	ELECTRIC_URL: string;
	ELECTRIC_SECRET: string;
}

const ELECTRIC_PROTOCOL_PARAMS = new Set([
	"live",
	"live_sse",
	"handle",
	"offset",
	"cursor",
	"expired_handle",
	"log",
	"subset__where",
	"subset__limit",
	"subset__offset",
	"subset__order_by",
	"subset__params",
	"subset__where_expr",
	"subset__order_by_expr",
	"cache-buster",
]);

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Expose-Headers":
		"electric-handle, electric-offset, electric-cursor, electric-schema, electric-chunk-last-offset, electric-up-to-date",
};

function corsResponse(status: number, body: string): Response {
	return new Response(body, { status, headers: CORS_HEADERS });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (request.method !== "GET") {
			return corsResponse(405, "Method not allowed");
		}

		const url = new URL(request.url);

		if (!url.pathname.startsWith("/v1/shape")) {
			return corsResponse(404, "Not found");
		}

		const authHeader = request.headers.get("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return corsResponse(401, "Missing or invalid Authorization header");
		}

		const token = authHeader.slice(7);
		let claims: { organizationIds: string[] };
		try {
			claims = await verifyJWT({
				token,
				jwksUrl: env.JWKS_URL,
				issuer: env.JWT_ISSUER,
				audience: env.JWT_AUDIENCE,
			});
		} catch (error) {
			console.error("[auth/verify] JWT verification failed:", error);
			return corsResponse(401, "Invalid token");
		}

		const table = url.searchParams.get("table");
		if (!table) {
			return corsResponse(400, "Missing table parameter");
		}

		const organizationId = url.searchParams.get("organizationId") ?? "";

		if (table !== "auth.organizations") {
			if (!organizationId) {
				return corsResponse(400, "Missing organizationId parameter");
			}
			if (!claims.organizationIds.includes(organizationId)) {
				return corsResponse(403, "Not a member of this organization");
			}
		}

		const whereClause = buildWhereClause({
			table,
			organizationId,
			organizationIds: claims.organizationIds,
		});

		if (!whereClause) {
			return corsResponse(400, `Unknown table: ${table}`);
		}

		const originUrl = new URL(env.ELECTRIC_URL);
		originUrl.searchParams.set("secret", env.ELECTRIC_SECRET);
		originUrl.searchParams.set("table", table);
		originUrl.searchParams.set("where", whereClause.fragment);

		for (let i = 0; i < whereClause.params.length; i++) {
			originUrl.searchParams.set(`params[${i + 1}]`, whereClause.params[i]);
		}

		if (whereClause.columns) {
			originUrl.searchParams.set("columns", whereClause.columns);
		}

		for (const [key, value] of url.searchParams) {
			if (ELECTRIC_PROTOCOL_PARAMS.has(key)) {
				originUrl.searchParams.set(key, value);
			}
		}

		const response = await fetch(originUrl.toString(), {
			cf: { cacheEverything: true },
		});

		const headers = new Headers(response.headers);
		headers.set("Vary", "Authorization");

		if (headers.has("content-encoding")) {
			headers.delete("content-encoding");
			headers.delete("content-length");
		}

		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			headers.set(key, value);
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	},
};
