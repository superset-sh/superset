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

	if (session && isAuthPageRoute(pathname)) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	if (!session && !isPublicRoute(pathname)) {
		const signInUrl = new URL("/sign-in", req.url);
		signInUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
		return NextResponse.redirect(signInUrl);
	}

	// Pending-deletion accounts only get the recovery page; API routes stay
	// reachable so the reactivate mutation itself can go through.
	const isApiRoute =
		pathname.startsWith("/api") || pathname.startsWith("/trpc");
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
