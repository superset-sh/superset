import { auth } from "@superset/auth/server";
import { COMPANY } from "@superset/shared/constants";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import {
	isAuthPageRoute,
	isInternalRoute,
	isPublicRoute,
} from "./proxy-routes";

export default async function proxy(req: NextRequest) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	const pathname = req.nextUrl.pathname;

	// API routes must never redirect to /sign-in: clients (CLI, host-service,
	// remote relay) parse the response body as JSON, so a 307 with a text/plain
	// "Redirecting..." body surfaces as an opaque "Failed to parse JSON" in
	// production for a stale or missing session (#7072). Answer with a JSON 401
	// instead so the caller can diagnose and re-auth.
	//
	// Match the exact route or a slash-delimited child only — `/api-keys`,
	// `/apiary`, `/trpcfoo` are page routes, not API routes, and must keep the
	// page redirect.
	const isApiRoute =
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		pathname === "/trpc" ||
		pathname.startsWith("/trpc/");

	if (session && isAuthPageRoute(pathname)) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	// Public API routes (e.g. `/api/auth/desktop`, the desktop OAuth start)
	// must stay reachable unauthenticated — exclude them so they don't fall
	// into the JSON-401 gate.
	if (!session && isApiRoute && !isPublicRoute(pathname)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (!session && !isPublicRoute(pathname)) {
		const signInUrl = new URL("/sign-in", req.url);
		signInUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
		return NextResponse.redirect(signInUrl);
	}

	// Pending-deletion accounts only get the recovery page; API routes stay
	// reachable so the reactivate mutation itself can go through.
	if (
		session?.user.deletionRequestedAt &&
		!isApiRoute &&
		!isPublicRoute(pathname)
	) {
		if (pathname !== "/account-pending-deletion") {
			return NextResponse.redirect(
				new URL("/account-pending-deletion", req.url),
			);
		}
	} else if (session && pathname === "/account-pending-deletion") {
		return NextResponse.redirect(new URL("/", req.url));
	}

	if (
		session &&
		isInternalRoute(pathname) &&
		!session.user.email.endsWith(COMPANY.EMAIL_DOMAIN)
	) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
