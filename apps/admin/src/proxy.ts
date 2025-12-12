import { COMPANY } from "@superset/shared/constants";
import { createCaller, createTRPCContext } from "@superset/trpc";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "./env";

/**
 * Public routes that bypass auth
 */
const PUBLIC_ROUTES = ["/ingest", "/monitoring"];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);
}

/**
 * Auth proxy - validates user authentication and domain access.
 *
 * When real auth (Clerk) is added, replace with Clerk's proxy/middleware.
 */
export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Allow public routes
	if (isPublicRoute(pathname)) {
		return NextResponse.next();
	}

	try {
		// Create tRPC caller with current session context
		const ctx = await createTRPCContext({ headers: request.headers });
		const caller = createCaller(ctx);

		// Get current user (throws if not authenticated)
		const user = await caller.user.me();

		// Validate domain access
		if (!user?.email.endsWith(COMPANY.emailDomain)) {
			return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
		}

		return NextResponse.next();
	} catch {
		// Not authenticated - redirect to web app
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}
}

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
