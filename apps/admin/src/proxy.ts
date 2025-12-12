import { clerkMiddleware } from "@clerk/nextjs/server";
import { db, eq } from "@superset/db";
import { users } from "@superset/db/schema";
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

	const { userId: clerkId } = await auth();

	if (!clerkId) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkId),
	});

	if (!user?.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
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
