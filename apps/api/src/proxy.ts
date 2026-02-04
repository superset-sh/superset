import { type NextRequest, NextResponse } from "next/server";

import { env } from "./env";

const allowedOrigins = [
	env.NEXT_PUBLIC_WEB_URL,
	env.NEXT_PUBLIC_ADMIN_URL,
	// Desktop dev server - use env var to support multi-worktree dev instances
	env.NEXT_PUBLIC_DESKTOP_URL,
].filter(Boolean);

function getCorsHeaders(origin: string | null) {
	const isAllowed = origin && allowedOrigins.includes(origin);
	return {
		"Access-Control-Allow-Origin": isAllowed ? origin : "",
		"Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, x-trpc-source, trpc-accept",
		"Access-Control-Allow-Credentials": "true",
	};
}

export default function proxy(req: NextRequest) {
	const origin = req.headers.get("origin");
	const corsHeaders = getCorsHeaders(origin);

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

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
