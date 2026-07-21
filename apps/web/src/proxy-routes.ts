const authPageRoutes = ["/sign-in", "/sign-up"] as const;

const otherPublicRoutes = [
	"/auth/desktop",
	"/api/auth/desktop",
	"/accept-invitation",
	"/cli/auth/code",
] as const;

const publicRoutes = [...authPageRoutes, ...otherPublicRoutes] as const;

function matchesRouteOrChild(pathname: string, route: string): boolean {
	return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => matchesRouteOrChild(pathname, route));
}

export function isAuthPageRoute(pathname: string): boolean {
	return authPageRoutes.some((route) => matchesRouteOrChild(pathname, route));
}
