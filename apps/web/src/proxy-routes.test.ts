import { describe, expect, test } from "bun:test";

import { PUBLIC_WORKSPACE_HANDOFF_PATH } from "@superset/shared/workspace-links";

import {
	isAuthPageRoute,
	isInternalRoute,
	isPublicRoute,
} from "./proxy-routes";

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
		// The workspace handoff hands a native link to someone who is not
		// signed in on the web; gating it behind sign-in defeats the point.
		"/open/v2-workspace",
		"/open/v2-workspace/b502bf30-8693-4815-be65-795035e0ce5f",
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
		// Only the workspace handoff is public under /open, not /open itself
		// nor a future sibling handoff.
		"/open",
		"/open/v2-workspaces",
		"/open/task",
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

describe("isInternalRoute", () => {
	test.each([
		"/design",
		"/design/tokens",
	])("matches internal routes exactly or by child path: %s", (pathname: string) => {
		expect(isInternalRoute(pathname)).toBe(true);
	});

	test.each([
		"/",
		"/designer",
		"/dashboard",
	])("keeps sibling routes out of the internal gate: %s", (pathname: string) => {
		expect(isInternalRoute(pathname)).toBe(false);
	});
});

describe("public route declaration", () => {
	test("matches the handoff path the canonical link builder emits", () => {
		expect(isPublicRoute(PUBLIC_WORKSPACE_HANDOFF_PATH)).toBe(true);
	});
});
