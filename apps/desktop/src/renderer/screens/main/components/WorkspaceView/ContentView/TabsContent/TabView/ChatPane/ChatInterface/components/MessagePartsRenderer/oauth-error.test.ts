import { describe, expect, it } from "bun:test";
import {
	ANTHROPIC_OAUTH_REAUTH_ERROR_CODE,
	resolveOAuthReauthErrorUi,
} from "./oauth-error";

describe("resolveOAuthReauthErrorUi", () => {
	it("matches structured oauth reauth error code", () => {
		const result = resolveOAuthReauthErrorUi({
			type: "error",
			code: ANTHROPIC_OAUTH_REAUTH_ERROR_CODE,
			text: "anything",
		});

		expect(result?.kind).toBe("oauth-reauth");
		expect(result?.actionUrl).toBe("https://console.anthropic.com");
	});

	it("matches legacy oauth expiry text", () => {
		const result = resolveOAuthReauthErrorUi({
			type: "error",
			text: "OAuth token has expired. Please obtain a new token or refresh your existing token.",
		});

		expect(result?.kind).toBe("oauth-reauth");
	});

	it("returns null for non-oauth errors", () => {
		const result = resolveOAuthReauthErrorUi({
			type: "error",
			text: "network timeout",
		});

		expect(result).toBeNull();
	});
});
