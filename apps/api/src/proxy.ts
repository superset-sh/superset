import { getTrustedVercelPreviewOrigins } from "@superset/shared/vercel-preview-origins";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "./env";

const desktopDevPort = process.env.DESKTOP_VITE_PORT || "5173";
const desktopDevOrigins =
	process.env.NODE_ENV === "development"
		? [
				`http://localhost:${desktopDevPort}`,
				`http://127.0.0.1:${desktopDevPort}`,
			]
		: [];

function getAllowedOrigins(deploymentOrigin: string) {
	return [
		env.NEXT_PUBLIC_WEB_URL,
		env.NEXT_PUBLIC_ADMIN_URL,
		env.NEXT_PUBLIC_DESKTOP_URL,
		...getTrustedVercelPreviewOrigins(deploymentOrigin),
		...desktopDevOrigins,
	].filter(Boolean);
}

function getCorsHeaders(origin: string | null, deploymentOrigin: string) {
	const allowedOrigins = getAllowedOrigins(deploymentOrigin);
	const isAllowed = origin && allowedOrigins.includes(origin);
	return {
		"Access-Control-Allow-Origin": isAllowed ? origin : "",
		"Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, x-trpc-source, trpc-accept, Producer-Id, Producer-Epoch, Producer-Seq, Stream-Closed",
		"Access-Control-Expose-Headers": [
			// Durable stream headers
			"Stream-Next-Offset",
			"Stream-Cursor",
			"Stream-Up-To-Date",
			"Stream-Closed",
			"Stream-Total-Size",
			"Stream-Write-Units",
			"Producer-Epoch",
			"Producer-Expected-Seq",
			"Producer-Received-Seq",
			"ETag",
		].join(", "),
		"Access-Control-Allow-Credentials": "true",
	};
}

export default function proxy(req: NextRequest) {
	const origin = req.headers.get("origin");
	const corsHeaders = getCorsHeaders(origin, req.nextUrl.origin);

	// Handle preflight
	if (req.method === "OPTIONS") {
		return new NextResponse(null, { status: 204, headers: corsHeaders });
	}

	// Add CORS headers to all responses
	const response = NextResponse.next();
	for (const [key, value] of Object.entries(corsHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

// Allowlist of browser-cross-origin endpoints. The api app is purely an API
// (no pages), so default-deny is the right posture: anything not listed here
// is treated as server-to-server, doesn't run the CORS shim, and doesn't
// produce a per-request Vercel `serverless-middleware` log line. Adding a new
// browser-facing route requires deliberately extending this list — same
// posture you'd want for "what can cross-origin browsers reach".
//
// Verified callers (`NEXT_PUBLIC_API_URL`/`apiUrl` grep across web, admin,
// desktop renderers):
//   /api/trpc        — cross-origin tRPC from all three frontends
//   /api/auth/*      — better-auth catch-all (sign-in, sign-out, get-session,
//                      accept-invitation, callback/*); jwks + token excluded
//                      since only relay/electric-proxy/mcp-v2/SDK/host-service
//                      hit them, all server-to-server
//   /api/proxy/*     — Linear image proxy, called by desktop MarkdownEditor
//   /api/chat/*      — chat session GET + streaming SSE from desktop renderer
//   /api/desktop/version — minimum-version probe. Orphaned on main (the
//                      consuming useVersionCheck hook was unwired by an
//                      earlier routing refactor) but still hit by older
//                      shipped builds; kept here for backwards compat.
//                      Migrate to a tRPC procedure when the gate is rewired
//                      and let this REST entry age out.
//
// OAuth connect redirects (/api/github/install, /api/integrations/*/connect)
// are `window.location.href` full-page navigations — browsers don't preflight
// those, so no CORS needed.
export const config = {
	matcher: [
		"/api/trpc/:path*",
		"/api/auth/((?!jwks|token).*)",
		"/api/proxy/:path*",
		"/api/chat/:path*",
		"/api/desktop/version",
	],
};
