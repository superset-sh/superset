import { expect, test } from "bun:test";
import { assertGitLabOAuthOrigin } from "./oauth-origin";

test("OAuth is bound to the exact configured registration origin", () => {
	expect(assertGitLabOAuthOrigin("https://gitlab.com", "")).toBe(
		"https://gitlab.com",
	);
	expect(
		assertGitLabOAuthOrigin(
			"https://GIT.INTERNAL:8443/",
			"https://git.internal:8443",
		),
	).toBe("https://git.internal:8443");
	for (const input of [
		"https://evil.test",
		"https://git.internal",
		"http://git.internal:8443",
		"https://user:pass@git.internal:8443",
		"https://git.internal:8443/path",
		"https://git.internal:8443?x=1",
		"https://git.internal:8443#x",
		"https://git.internal:8443\\@evil.test",
	])
		expect(() =>
			assertGitLabOAuthOrigin(input, "https://git.internal:8443"),
		).toThrow();
});
test("invalid issuer never falls back to a different OAuth registration", () => {
	for (const issuer of [
		"http://gitlab.com",
		"https://127.0.0.1",
		"https://git.internal/path",
		"https://user:pass@gitlab.com",
	])
		expect(() =>
			assertGitLabOAuthOrigin("https://gitlab.com", issuer),
		).toThrow();
});
