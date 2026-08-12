import { describe, expect, it } from "bun:test";
import { isAnthropicApiKey, isOpenAIApiKey } from "./get-small-model";

describe("isAnthropicApiKey", () => {
	it("accepts a real-shaped key", () => {
		expect(
			isAnthropicApiKey(
				"sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			),
		).toBe(true);
	});

	it("rejects dev placeholders", () => {
		expect(isAnthropicApiKey("dummy")).toBe(false);
		expect(isAnthropicApiKey("placeholder")).toBe(false);
		expect(isAnthropicApiKey("")).toBe(false);
	});

	it("rejects OAuth access tokens (sk-ant-oat…) sent as api keys", () => {
		// OAuth tokens fail when sent via x-api-key. Filter them so we fall
		// through to the OAuth path which sends them via Authorization Bearer.
		expect(
			isAnthropicApiKey("sk-ant-oat-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(false);
	});

	it("rejects keys with the prefix but absurd lengths", () => {
		expect(isAnthropicApiKey("sk-ant-api")).toBe(false);
	});

	it("rejects unrelated provider keys", () => {
		expect(isAnthropicApiKey("sk-proj-foo")).toBe(false);
	});
});

describe("isOpenAIApiKey", () => {
	it("accepts legacy, project, and service-account key shapes", () => {
		expect(
			isOpenAIApiKey("sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(true);
		expect(
			isOpenAIApiKey("sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(true);
		expect(
			isOpenAIApiKey("sk-svcacct-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		).toBe(true);
	});

	it("rejects dev placeholders and obviously-fake values", () => {
		expect(isOpenAIApiKey("dummy")).toBe(false);
		expect(isOpenAIApiKey("sk-")).toBe(false);
		expect(isOpenAIApiKey("")).toBe(false);
	});

	it("rejects values without the sk- prefix", () => {
		expect(isOpenAIApiKey("api-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
	});
});
