import { auth0 } from "@superset/auth0/server";
import { db, eq } from "@superset/db";
import { users } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "./env";

const PUBLIC_ROUTES = ["/api/auth", "/ingest", "/monitoring"];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);
}

export default async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Run Auth0 middleware first (handles /api/auth/* routes)
	const authResponse = await auth0.middleware(req);

	// If Auth0 handled the request, return its response
	if (pathname.startsWith("/api/auth")) {
		return authResponse;
	}

	if (isPublicRoute(pathname)) {
		return NextResponse.next();
	}

	// Get session to check authentication
	const session = await auth0.getSession();

	if (!session?.user) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	const auth0Id = session.user.sub;
	const user = await db.query.users.findFirst({
		where: eq(users.auth0Id, auth0Id),
	});

	if (!user?.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
