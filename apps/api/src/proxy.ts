import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { env } from "./env";

const allowedOrigins = [env.NEXT_PUBLIC_WEB_URL, env.NEXT_PUBLIC_ADMIN_URL];

function getCorsHeaders(origin: string | null) {
	const isAllowed = origin && allowedOrigins.includes(origin);
	return {
		"Access-Control-Allow-Origin": isAllowed ? origin : "",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, x-trpc-source, trpc-accept",
		"Access-Control-Allow-Credentials": "true",
	};
}

export default clerkMiddleware(async (_auth, req) => {
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
});

export const config = {
	matcher: [
		// Skip Next.js internals and static files
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
