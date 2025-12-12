import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
	"/sign-in(.*)",
	"/sign-up(.*)",
	"/sso-callback(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
	const { userId } = await auth();

	// Redirect authenticated users away from auth pages
	if (
		userId &&
		(req.nextUrl.pathname.startsWith("/sign-in") ||
			req.nextUrl.pathname.startsWith("/sign-up"))
	) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	// Redirect unauthenticated users to sign-in
	if (!userId && !isPublicRoute(req)) {
		return NextResponse.redirect(new URL("/sign-in", req.url));
	}

	return NextResponse.next();
});

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
