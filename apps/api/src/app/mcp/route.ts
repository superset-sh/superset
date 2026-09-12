import { createHash } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	createMcpServer,
	isMcpUnauthorized,
	MCP_SERVER_VERSION,
	type McpContext,
	resolveMcpContext,
} from "@superset/mcp";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import {
	getOAuthProtectedResourceMetadataUrl,
	getRequestOrigin,
} from "@/lib/oauth-metadata";

// Per-credential (or per-IP before auth) ceiling on MCP requests. Generous:
// a busy orchestrator polling terminals stays well under it; a runaway loop
// gets a 429 with Retry-After instead of degrading everyone else.
const RATE_LIMIT_REQUESTS = 600;
const RATE_LIMIT_WINDOW_SECONDS = 60;

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(
		RATE_LIMIT_REQUESTS,
		`${RATE_LIMIT_WINDOW_SECONDS} s`,
	),
	prefix: "ratelimit:mcp",
});

interface RateLimitState {
	success: boolean;
	limit: number;
	remaining: number;
	/** Epoch milliseconds when the window resets. */
	reset: number;
}

function rateLimitKey(req: Request): string {
	const authorization = req.headers.get("authorization") ?? "";
	const token = authorization.replace(/^Bearer\s+/i, "").trim();
	if (token) {
		const digest = createHash("sha256").update(token).digest("hex");
		return `token:${digest.slice(0, 32)}`;
	}
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown";
	return `ip:${ip}`;
}

async function checkRateLimit(
	req: Request,
): Promise<RateLimitState | undefined> {
	try {
		const result = await rateLimit.limit(rateLimitKey(req));
		return {
			success: result.success,
			limit: result.limit,
			remaining: result.remaining,
			reset: result.reset,
		};
	} catch {
		// Redis unavailable: fail open rather than take the MCP server down.
		return undefined;
	}
}

// IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers) plus the
// X-RateLimit-* names most SDKs already parse.
function withRateLimitHeaders(
	response: Response,
	state: RateLimitState | undefined,
): Response {
	if (!state) return response;
	const resetInSeconds = Math.max(
		0,
		Math.ceil((state.reset - Date.now()) / 1000),
	);
	const remaining = Math.max(0, state.remaining);
	const headers = new Headers(response.headers);
	headers.set("RateLimit-Limit", String(state.limit));
	headers.set("RateLimit-Remaining", String(remaining));
	headers.set("RateLimit-Reset", String(resetInSeconds));
	headers.set(
		"RateLimit-Policy",
		`${state.limit};w=${RATE_LIMIT_WINDOW_SECONDS}`,
	);
	headers.set("X-RateLimit-Limit", String(state.limit));
	headers.set("X-RateLimit-Remaining", String(remaining));
	headers.set("X-RateLimit-Reset", String(Math.ceil(state.reset / 1000)));
	if (response.status === 429) {
		headers.set("Retry-After", String(Math.max(1, resetInSeconds)));
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function rateLimitedResponse(): Response {
	return Response.json(
		{
			error: {
				code: "RATE_LIMITED",
				message: `Too many MCP requests: the limit is ${RATE_LIMIT_REQUESTS} per ${RATE_LIMIT_WINDOW_SECONDS} seconds per credential.`,
				hint: "Wait for the number of seconds in the Retry-After header, then retry. Batch reads where you can (for example terminals_read with a larger line count) instead of polling in a tight loop.",
			},
		},
		{ status: 429, headers: { "Content-Type": "application/json" } },
	);
}

function unauthorizedResponse(req: Request, message: string): Response {
	return new Response(
		JSON.stringify({ error: { code: "UNAUTHORIZED", message } }),
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer realm="superset", resource_metadata="${getOAuthProtectedResourceMetadataUrl(req)}"`,
				"Content-Type": "application/json",
			},
		},
	);
}

// A plain GET (no `Accept: text/event-stream`) is not an MCP stream request;
// it is a human or an agent following a link. Describe the server instead of
// answering 401, so the endpoint URL itself resolves to something useful.
function describeServer(req: Request): Response {
	const origin = getRequestOrigin(req);
	return Response.json(
		{
			name: "superset",
			title: "Superset",
			version: MCP_SERVER_VERSION,
			description:
				"Superset MCP server (Model Context Protocol over Streamable HTTP). Create Git-worktree workspaces, launch coding-agent sessions, open terminals, schedule automations, and manage tasks on behalf of a Superset user.",
			transport: "streamable-http",
			url: `${origin}/mcp`,
			usage:
				"POST JSON-RPC 2.0 messages to this URL with `Accept: application/json, text/event-stream` and a Bearer token (OAuth 2.1 access token or Superset API key). Start with `initialize`, then `tools/list`.",
			serverCard: `${origin}/.well-known/mcp/server-card.json`,
			openapi: `${origin}/openapi.json`,
			documentation: "https://docs.superset.sh/mcp-server",
			authentication: {
				type: "oauth2",
				resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(req),
				walkthrough: "https://superset.sh/auth.md",
			},
			install: "https://superset.sh/mcp-install",
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=3600, s-maxage=3600",
			},
		},
	);
}

async function handle(req: Request): Promise<Response> {
	if (
		req.method === "GET" &&
		!(req.headers.get("accept") ?? "").includes("text/event-stream")
	) {
		return describeServer(req);
	}

	const rateLimitState = await checkRateLimit(req);
	if (rateLimitState && !rateLimitState.success) {
		return withRateLimitHeaders(rateLimitedResponse(), rateLimitState);
	}

	let ctx: McpContext;
	try {
		ctx = await resolveMcpContext(req, {
			apiUrl: env.NEXT_PUBLIC_API_URL,
			relayUrl: env.RELAY_URL,
		});
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			return withRateLimitHeaders(
				unauthorizedResponse(req, error.message),
				rateLimitState,
			);
		}
		throw error;
	}

	ctx.relayUrl = env.RELAY_URL;

	const server = createMcpServer({
		onToolCall: (event) => {
			posthog.capture({
				distinctId: event.userId,
				event: "mcp_tool_called",
				properties: {
					tool: event.toolName,
					organization_id: event.organizationId,
					auth_source: event.source,
					client_label: event.clientLabel,
					duration_ms: event.durationMs,
					success: event.success,
					error_message: event.errorMessage,
					mcp_server: "superset-v2",
					mcp_server_version: MCP_SERVER_VERSION,
				},
				groups: { organization: event.organizationId },
			});
		},
	});
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);

	const response = await transport.handleRequest(req, {
		authInfo: {
			token: ctx.bearerToken,
			clientId: ctx.source === "api-key" ? "api-key" : "oauth",
			scopes: ["mcp:full"],
			extra: { mcpContext: ctx },
		},
	});
	return withRateLimitHeaders(response, rateLimitState);
}

export const maxDuration = 800;

export { handle as GET, handle as POST, handle as DELETE };
