import { describe, expect, test } from "bun:test";

import { isAuthPageRoute, isPublicRoute } from "./proxy-routes";

describe("isPublicRoute", () => {
	test.each([
		"/sign-in",
		"/sign-in/callback",
		"/sign-up",
		"/auth/desktop",
		"/auth/desktop/success",
		"/api/auth/desktop",
		"/api/auth/desktop/callback",
		"/accept-invitation",
		"/accept-invitation/invitation-123",
		"/cli/auth/code",
		"/cli/auth/code/success",
	])("allows the exact public route or its children: %s", (pathname: string) => {
		expect(isPublicRoute(pathname)).toBe(true);
	});

	test.each([
		"/",
		"/dashboard",
		"/sign-internal",
		"/sign-internal/settings",
		"/sign-upgrade",
		"/auth/desktopish",
		"/api/auth/desktopish",
		"/accept-invitation-list",
		"/cli/auth/codegen",
	])("keeps sibling routes protected: %s", (pathname: string) => {
		expect(isPublicRoute(pathname)).toBe(false);
	});
});

describe("isAuthPageRoute", () => {
	test.each([
		"/sign-in",
		"/sign-in/callback",
		"/sign-up",
		"/sign-up/verify",
	])("matches auth page routes exactly or by child path: %s", (pathname: string) => {
		expect(isAuthPageRoute(pathname)).toBe(true);
	});

	test.each([
		"/",
		"/dashboard",
		"/sign-internal",
		"/sign-internal/settings",
		"/sign-upgrade",
	])("does not match sibling routes for authenticated redirects: %s", (pathname: string) => {
		expect(isAuthPageRoute(pathname)).toBe(false);
	});
});
