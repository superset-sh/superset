// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${config.*} and ${inputs.*} are the manifest placeholder syntax, not template literals
import { describe, expect, test } from "bun:test";
import {
	resolveTemplate,
	resolveTemplateDeep,
	resolveUrlTemplate,
} from "./manifest";

const scope = {
	config: { access_token: "tok_123" },
	inputs: { site: "acme.atlassian.net" },
};

describe("resolveTemplate", () => {
	test("expands config and inputs", () => {
		expect(resolveTemplate("Bearer ${config.access_token}", scope)).toBe(
			"Bearer tok_123",
		);
		expect(resolveTemplate("https://${inputs.site}/mcp", scope)).toBe(
			"https://acme.atlassian.net/mcp",
		);
	});

	test.each([
		"${env.DATABASE_URL}",
		"${process.env.SECRET}",
		"${globalThis.x}",
		"${secrets.token}",
	])("leaves %s literal", (template) => {
		expect(resolveTemplate(template, scope)).toBe(template);
	});

	test("leaves an unknown key under a known root literal", () => {
		expect(resolveTemplate("${config.refresh_token}", scope)).toBe(
			"${config.refresh_token}",
		);
	});

	test("resolves deeply through objects and arrays", () => {
		expect(
			resolveTemplateDeep(
				{
					headers: { Authorization: "Bearer ${config.access_token}" },
					q: ["${inputs.site}"],
				},
				scope,
			),
		).toEqual({
			headers: { Authorization: "Bearer tok_123" },
			q: ["acme.atlassian.net"],
		});
	});
});

describe("resolveUrlTemplate", () => {
	const secrets = ["api_key"];
	const withSecret = {
		config: { access_token: "tok_123" },
		inputs: { site: "acme.atlassian.net", api_key: "lin_api_secret" },
	};

	test("expands a non-secret input, which is what per-tenant hosts need", () => {
		expect(
			resolveUrlTemplate("https://${inputs.site}/mcp", withSecret, secrets),
		).toBe("https://acme.atlassian.net/mcp");
	});

	test("refuses to put the access token in a URL", () => {
		expect(() =>
			resolveUrlTemplate("https://x/?t=${config.access_token}", scope, secrets),
		).toThrow(/credential/);
	});

	test("refuses to put a secret input in a URL", () => {
		expect(() =>
			resolveUrlTemplate("https://x/?k=${inputs.api_key}", withSecret, secrets),
		).toThrow(/secret/);
	});

	test("a secret input is still expandable where no connector declares it", () => {
		expect(
			resolveUrlTemplate(
				"https://x/?k=${inputs.api_key}",
				withSecret,
				undefined,
			),
		).toBe("https://x/?k=lin_api_secret");
	});

	test("refuses a connector's credential input even when it is not marked secret", () => {
		expect(() =>
			resolveUrlTemplate(
				"https://x/?k=${inputs.token}",
				{ inputs: { token: "raw" } },
				["token"],
			),
		).toThrow(/secret/);
	});

	test("refuses an input value that would rewrite the URL's host", () => {
		expect(() =>
			resolveUrlTemplate(
				"https://${inputs.site}/mcp",
				{ inputs: { site: "evil.example@real.example" } },
				secrets,
			),
		).toThrow(/host or path/);
	});
});
