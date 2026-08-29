import { PUBLIC_WORKSPACE_HANDOFF_PATH } from "@superset/shared/workspace-links";

const authPageRoutes = ["/sign-in", "/sign-up"] as const;

const otherPublicRoutes = [
	"/auth/desktop",
	"/api/auth/desktop",
	"/accept-invitation",
	"/cli/auth/code",
	// Hands a workspace link off to the desktop app. The link is published by
	// external systems (Linear, GitHub) to people who are not signed in on the
	// web, and the page resolves nothing: sign-in would only get in the way.
	PUBLIC_WORKSPACE_HANDOFF_PATH,
] as const;

const publicRoutes = [...authPageRoutes, ...otherPublicRoutes] as const;

/** Routes only visible to signed-in company accounts (COMPANY.EMAIL_DOMAIN). */
const internalRoutes = ["/design"] as const;

function matchesRouteOrChild(pathname: string, route: string): boolean {
	return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => matchesRouteOrChild(pathname, route));
}

export function isAuthPageRoute(pathname: string): boolean {
	return authPageRoutes.some((route) => matchesRouteOrChild(pathname, route));
}

export function isInternalRoute(pathname: string): boolean {
	return internalRoutes.some((route) => matchesRouteOrChild(pathname, route));
}
