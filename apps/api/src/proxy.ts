import { auth0 } from "@superset/auth0/server";
import type { NextRequest } from "next/server";
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

export default async function middleware(req: NextRequest) {
	const origin = req.headers.get("origin");
	const corsHeaders = getCorsHeaders(origin);

	// Handle preflight
	if (req.method === "OPTIONS") {
		return new NextResponse(null, { status: 204, headers: corsHeaders });
	}

	// Run Auth0 middleware for auth routes
	const authResponse = await auth0.middleware(req);

	// If Auth0 handled the request (auth routes), return its response with CORS
	if (
		authResponse.status !== 200 ||
		req.nextUrl.pathname.startsWith("/api/auth")
	) {
		// Clone headers and add CORS
		const headers = new Headers(authResponse.headers);
		for (const [key, value] of Object.entries(corsHeaders)) {
			headers.set(key, value);
		}
		return new NextResponse(authResponse.body, {
			status: authResponse.status,
			headers,
		});
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
		// Skip Next.js internals and static files
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
