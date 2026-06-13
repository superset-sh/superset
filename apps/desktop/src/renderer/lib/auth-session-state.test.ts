import { describe, expect, it } from "bun:test";
import {
	isStoredAuthTokenCurrent,
	shouldRecoverAuthenticatedSession,
} from "./auth-session-state";

describe("auth session state", () => {
	it("treats only future stored token expirations as current", () => {
		const now = Date.parse("2026-06-13T09:00:00.000Z");

		expect(isStoredAuthTokenCurrent("2026-06-13T09:00:01.000Z", now)).toBe(
			true,
		);
		expect(isStoredAuthTokenCurrent("2026-06-13T08:59:59.000Z", now)).toBe(
			false,
		);
		expect(isStoredAuthTokenCurrent("not-a-date", now)).toBe(false);
		expect(isStoredAuthTokenCurrent(null, now)).toBe(false);
	});

	it("recovers an authenticated route when a local token exists but session is temporarily missing", () => {
		expect(
			shouldRecoverAuthenticatedSession({
				hasLocalToken: true,
				isOnline: true,
				isSignedIn: false,
				skipEnvValidation: false,
			}),
		).toBe(true);

		expect(
			shouldRecoverAuthenticatedSession({
				hasLocalToken: false,
				isOnline: true,
				isSignedIn: false,
				skipEnvValidation: false,
			}),
		).toBe(false);
		expect(
			shouldRecoverAuthenticatedSession({
				hasLocalToken: true,
				isOnline: false,
				isSignedIn: false,
				skipEnvValidation: false,
			}),
		).toBe(false);
		expect(
			shouldRecoverAuthenticatedSession({
				hasLocalToken: true,
				isOnline: true,
				isSignedIn: true,
				skipEnvValidation: false,
			}),
		).toBe(false);
	});

	it("does not sign out when the Electron main process reports a saved token", async () => {
		const providerSource = await Bun.file(
			new URL("../providers/AuthProvider/AuthProvider.tsx", import.meta.url),
		).text();

		expect(providerSource).not.toContain("authClient.signOut");
	});
});
