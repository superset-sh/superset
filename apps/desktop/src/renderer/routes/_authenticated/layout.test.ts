import { describe, expect, test } from "bun:test";

/**
 * Mirrors the redirect/render decision logic in AuthenticatedLayout.
 *
 * Returns one of three outcomes:
 *  "sign-in"  – navigate to the sign-in page (the user is not authenticated)
 *  "spinner"  – show a loading spinner while the session is resolving
 *  "offline"  – show the offline / connection-error retry screen
 *  "render"   – render the authenticated app
 */
function resolveAuthState({
	isSignedIn,
	isPending,
	isRefetching,
	hasLocalToken,
	isOnline,
	hasSessionError,
}: {
	isSignedIn: boolean;
	isPending: boolean;
	isRefetching: boolean;
	hasLocalToken: boolean;
	isOnline: boolean;
	hasSessionError: boolean;
}): "sign-in" | "spinner" | "offline" | "render" {
	// No token + initial load → redirect immediately (no session exists)
	if (isPending && !hasLocalToken) return "sign-in";

	// Token exists or initial load in progress → wait for session
	if (isPending || (isRefetching && !isSignedIn && hasLocalToken))
		return "spinner";

	// Token exists but offline → show offline/retry screen
	if (!isSignedIn && hasLocalToken && !isOnline) return "offline";

	// BUG (issue #1937): token exists, online, but session fetch errored
	// (e.g. transient network failure right after Mac wakes from sleep).
	// Without this guard the layout falls through to the sign-in redirect
	// even though the token on disk is still valid.
	// FIX: treat a session error the same as offline — show the retry screen.
	if (!isSignedIn && hasLocalToken && hasSessionError) return "offline";

	// Genuinely not signed in → redirect
	if (!isSignedIn) return "sign-in";

	return "render";
}

describe("AuthenticatedLayout – sign-in redirect logic", () => {
	// ── happy path ────────────────────────────────────────────────────────────
	test("renders authenticated app when session is valid", () => {
		expect(
			resolveAuthState({
				isSignedIn: true,
				isPending: false,
				isRefetching: false,
				hasLocalToken: true,
				isOnline: true,
				hasSessionError: false,
			}),
		).toBe("render");
	});

	// ── no token at all ───────────────────────────────────────────────────────
	test("redirects to sign-in when no token and session is pending", () => {
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: true,
				isRefetching: false,
				hasLocalToken: false,
				isOnline: true,
				hasSessionError: false,
			}),
		).toBe("sign-in");
	});

	test("redirects to sign-in when no token and session resolved with no user", () => {
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: false,
				isRefetching: false,
				hasLocalToken: false,
				isOnline: true,
				hasSessionError: false,
			}),
		).toBe("sign-in");
	});

	// ── token exists, loading ─────────────────────────────────────────────────
	test("shows spinner during initial session load when token exists", () => {
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: true,
				isRefetching: false,
				hasLocalToken: true,
				isOnline: true,
				hasSessionError: false,
			}),
		).toBe("spinner");
	});

	test("shows spinner while refetching with token but no session yet", () => {
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: false,
				isRefetching: true,
				hasLocalToken: true,
				isOnline: true,
				hasSessionError: false,
			}),
		).toBe("spinner");
	});

	// ── offline ───────────────────────────────────────────────────────────────
	test("shows offline screen when token exists but device is offline", () => {
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: false,
				isRefetching: false,
				hasLocalToken: true,
				isOnline: false,
				hasSessionError: false,
			}),
		).toBe("offline");
	});

	// ── issue #1937: session error after wake-from-sleep ─────────────────────
	test("shows retry screen (not sign-in) when session errors but token exists", () => {
		// This is the regression test for issue #1937.
		//
		// Scenario: user leaves Mac unattended, lid closes. On wake, Electron
		// triggers a session refetch via `refetchOnWindowFocus`. The network
		// stack is momentarily unavailable, so the request fails and
		// better-auth sets data=null, error=<BetterFetchError>.
		//
		// Before the fix the layout fell through to `if (!isSignedIn)` and
		// showed the sign-in page, even though the on-disk token was still
		// valid. Refreshing (cmd+R) restored the session correctly.
		//
		// After the fix, a session error + valid local token shows the
		// offline/retry screen instead, letting the user retry without losing
		// their authenticated state.
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: false,
				isRefetching: false,
				hasLocalToken: true,
				isOnline: true,
				hasSessionError: true,
			}),
		).toBe("offline"); // retry screen, NOT sign-in
	});

	test("still redirects to sign-in when session errors with no local token", () => {
		// No token on disk → a session error means the user is genuinely logged out.
		expect(
			resolveAuthState({
				isSignedIn: false,
				isPending: false,
				isRefetching: false,
				hasLocalToken: false,
				isOnline: true,
				hasSessionError: true,
			}),
		).toBe("sign-in");
	});
});
