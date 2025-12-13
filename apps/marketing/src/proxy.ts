import { auth0 } from "@superset/auth0/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export default async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Run Auth0 middleware first (handles /api/auth/* routes)
	const authResponse = await auth0.middleware(req);

	// If Auth0 handled the request, return its response
	if (pathname.startsWith("/api/auth")) {
		return authResponse;
	}

	// Marketing site is public, just continue
	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
