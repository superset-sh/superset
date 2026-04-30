import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = [
	"/sign-in",
	"/sign-up",
	"/auth/desktop",
	"/api/auth/desktop",
	"/accept-invitation",
];

const PENDING_COOKIE_NAME = "superset_pending_auth_redirect";
const PENDING_COOKIE_TTL_SECONDS = 600;

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
		const params: Record<string, string> = {};
		req.nextUrl.searchParams.forEach((value, key) => {
			params[key] = value;
		});

		const signInUrl = new URL("/sign-in", req.url);
		signInUrl.searchParams.set("redirect", pathname);

		const response = NextResponse.redirect(signInUrl);
		response.cookies.set(
			PENDING_COOKIE_NAME,
			JSON.stringify({ path: pathname, params }),
			{
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				maxAge: PENDING_COOKIE_TTL_SECONDS,
				path: "/",
			},
		);
		return response;
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
