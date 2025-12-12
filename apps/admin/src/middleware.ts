import { clerkMiddleware } from "@clerk/nextjs/server";
import { COMPANY } from "@superset/shared/constants";
import { NextResponse } from "next/server";

import { env } from "./env";

const PUBLIC_ROUTES = ["/ingest", "/monitoring"];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);
}

export default clerkMiddleware(async (auth, req) => {
	const { pathname } = req.nextUrl;

	if (isPublicRoute(pathname)) {
		return NextResponse.next();
	}

	const { userId, sessionClaims } = await auth();

	if (!userId) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	const email = sessionClaims?.email as string | undefined;
	if (!email?.endsWith(COMPANY.emailDomain)) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	return NextResponse.next();
});

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
