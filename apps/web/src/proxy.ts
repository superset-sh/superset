import { auth0 } from "@superset/auth0/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const publicPaths = ["/api/auth", "/sign-in", "/sign-up"];

function isPublicPath(pathname: string): boolean {
	return publicPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
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

	// Get session to check authentication
	const session = await auth0.getSession();
	const isAuthenticated = !!session?.user;

	// Redirect authenticated users away from auth pages
	if (
		isAuthenticated &&
		(pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))
	) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	// Redirect unauthenticated users to sign-in
	if (!isAuthenticated && !isPublicPath(pathname)) {
		return NextResponse.redirect(new URL("/sign-in", req.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
