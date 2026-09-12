import { describe, expect, test } from "bun:test";
import {
	generateWebhookToken,
	hashWebhookToken,
	presentedWebhookToken,
	webhookTokenMatches,
} from "./webhookSecret";

/**
 * How a webhook delivery may present its token. The URL form exists for
 * producers whose settings accept nothing but a URL — most SaaS webhook
 * pages — so the URL itself carries the credential.
 */
describe("presentedWebhookToken", () => {
	test("reads the bearer header", () => {
		expect(
			presentedWebhookToken("Bearer sset_wh_abc", "https://x.test/hook"),
		).toBe("sset_wh_abc");
	});

	test("reads the token query parameter when there is no header", () => {
		expect(
			presentedWebhookToken(null, "https://x.test/hook?token=sset_wh_abc"),
		).toBe("sset_wh_abc");
	});

	// A sender that manages to send both meant the header: it is the form we
	// document as stronger, and the URL may be a stale paste.
	test("prefers the header over the URL", () => {
		expect(
			presentedWebhookToken(
				"Bearer sset_wh_header",
				"https://x.test/hook?token=sset_wh_url",
			),
		).toBe("sset_wh_header");
	});

	test("presents nothing when neither carries a token", () => {
		expect(presentedWebhookToken(null, "https://x.test/hook")).toBeNull();
		expect(
			presentedWebhookToken(null, "https://x.test/hook?other=1"),
		).toBeNull();
	});

	test("does not throw on an unparsable URL", () => {
		expect(presentedWebhookToken(null, "not a url")).toBeNull();
	});
});

describe("webhookTokenMatches", () => {
	test("a minted token authenticates against its own hash and no other", () => {
		const { token } = generateWebhookToken();
		const other = generateWebhookToken();
		const hash = hashWebhookToken(token);
		expect(webhookTokenMatches(token, hash)).toBe(true);
		expect(webhookTokenMatches(other.token, hash)).toBe(false);
		expect(webhookTokenMatches(token, null)).toBe(false);
	});
});
