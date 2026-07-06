import { describe, expect, test } from "bun:test";

import { isPublicRoute } from "./proxy-routes";

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
	])("allows the exact public route or its children: %s", (pathname) => {
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
	])("keeps sibling routes protected: %s", (pathname) => {
		expect(isPublicRoute(pathname)).toBe(false);
	});
});
