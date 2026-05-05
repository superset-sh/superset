import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = [
	"/sign-in",
	"/sign-up",
	"/auth/desktop",
	"/api/auth/desktop",
	"/accept-invitation",
	"/cli/auth/code",
];

function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => pathname.startsWith(route));
}

export default async function proxy(req: NextRequest) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	const pathname = req.nextUrl.pathname;

	if (
		session &&
		(pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))
	) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	if (!session && !isPublicRoute(pathname)) {
		const signInUrl = new URL("/sign-in", req.url);
		signInUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
		return NextResponse.redirect(signInUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
