import { describe, expect, it } from "bun:test";
import { parseOpencodeLogins } from "./opencode-quota";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("parseOpencodeLogins", () => {
	it("reads live Anthropic and OpenAI OAuth logins with their account id", () => {
		const logins = parseOpencodeLogins(
			JSON.stringify({
				anthropic: {
					type: "oauth",
					access: "sk-ant-oat",
					refresh: "sk-ant-ort",
					expires: NOW + HOUR,
				},
				openai: {
					type: "oauth",
					access: "eyJ",
					refresh: "rt.1",
					expires: NOW + HOUR,
					accountId: "acct-1",
				},
			}),
			NOW,
		);
		expect(logins).toEqual([
			{
				provider: "anthropic",
				credentialKind: "subscription",
				accessToken: "sk-ant-oat",
				accountId: null,
				lapsed: "live",
			},
			{
				provider: "openai",
				credentialKind: "subscription",
				accessToken: "eyJ",
				accountId: "acct-1",
				lapsed: "live",
			},
		]);
	});

	it("marks a lapsed access token stale while a refresh token remains, expired otherwise", () => {
		const logins = parseOpencodeLogins(
			JSON.stringify({
				anthropic: {
					type: "oauth",
					access: "a",
					refresh: "r",
					expires: NOW - HOUR,
				},
				openai: { type: "oauth", access: "b", expires: NOW - HOUR },
			}),
			NOW,
		);
		expect(logins.map((login) => login.lapsed)).toEqual([
			"token_stale",
			"token_expired",
		]);
	});

	it("keeps API keys as pay-per-token logins without reading the key", () => {
		const logins = parseOpencodeLogins(
			JSON.stringify({
				anthropic: { type: "api", key: "sk-ant-api03-secret" },
			}),
			NOW,
		);
		expect(logins).toEqual([
			{
				provider: "anthropic",
				credentialKind: "api_key",
				accessToken: null,
				accountId: null,
				lapsed: "live",
			},
		]);
	});

	it("ignores other providers, well-known keys, and unreadable files", () => {
		expect(
			parseOpencodeLogins(
				JSON.stringify({
					google: { type: "oauth", access: "x", expires: NOW + HOUR },
					openai: { type: "wellknown", key: "OPENAI_API_KEY", token: "t" },
				}),
				NOW,
			),
		).toEqual([]);
		expect(parseOpencodeLogins("not json", NOW)).toEqual([]);
		expect(parseOpencodeLogins("null", NOW)).toEqual([]);
	});
});
