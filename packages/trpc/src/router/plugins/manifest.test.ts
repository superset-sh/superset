// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${config.*} and ${inputs.*} are the manifest placeholder syntax, not template literals
import { describe, expect, test } from "bun:test";
import {
	credentialFetch,
	readPath,
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
	const auth = {
		type: "api_key" as const,
		inputs: [{ name: "site" }, { name: "api_key", secret: true }],
	};
	const withSecret = {
		config: { access_token: "tok_123" },
		inputs: { site: "acme.atlassian.net", api_key: "lin_api_secret" },
	};

	test("expands a non-secret input, which is what per-tenant hosts need", () => {
		expect(
			resolveUrlTemplate("https://${inputs.site}/mcp", withSecret, auth),
		).toBe("https://acme.atlassian.net/mcp");
	});

	test("refuses to put the access token in a URL", () => {
		expect(() =>
			resolveUrlTemplate("https://x/?t=${config.access_token}", scope, auth),
		).toThrow(/credential/);
	});

	test("refuses to put a secret input in a URL", () => {
		expect(() =>
			resolveUrlTemplate("https://x/?k=${inputs.api_key}", withSecret, auth),
		).toThrow(/secret/);
	});

	test("a secret input is still expandable where no manifest declares it", () => {
		expect(
			resolveUrlTemplate(
				"https://x/?k=${inputs.api_key}",
				withSecret,
				undefined,
			),
		).toBe("https://x/?k=lin_api_secret");
	});

	test("refuses an api_key's credential input even when it is not marked secret", () => {
		expect(() =>
			resolveUrlTemplate(
				"https://x/?k=${inputs.token}",
				{
					inputs: { token: "raw" },
				},
				{
					type: "api_key",
					credential_input: "token",
					inputs: [{ name: "token" }],
				},
			),
		).toThrow(/secret/);
	});

	test("refuses the default api_key input when the method names none", () => {
		expect(() =>
			resolveUrlTemplate(
				"https://x/?k=${inputs.api_key}",
				{ inputs: { api_key: "raw" } },
				{ type: "api_key", inputs: [{ name: "api_key" }] },
			),
		).toThrow(/secret/);
	});

	test("refuses an input value that would rewrite the URL's host", () => {
		expect(() =>
			resolveUrlTemplate(
				"https://${inputs.site}/mcp",
				{
					inputs: { site: "evil.example@real.example" },
				},
				auth,
			),
		).toThrow(/host or path/);
	});
});

describe("readPath", () => {
	test("reads a GitHub identity response", () => {
		const payload = { id: 17528887, login: "harshithmullapudi" };
		expect(readPath(payload, "$.id")).toBe(17528887);
		expect(readPath(payload, "$.login")).toBe("harshithmullapudi");
	});

	test("reads a nested GraphQL response", () => {
		const payload = {
			data: { viewer: { organization: { id: "org-1", name: "Tegon" } } },
		};
		expect(readPath(payload, "$.data.viewer.organization.id")).toBe("org-1");
	});

	test("indexes into arrays", () => {
		expect(
			readPath({ items: [{ id: "a" }, { id: "b" }] }, "$.items[1].id"),
		).toBe("b");
	});

	test.each([
		"$.a.b.c",
		"$.missing",
		"$.items[9].id",
	])("returns undefined for %s rather than throwing", (path) => {
		expect(readPath({ items: [] }, path)).toBeUndefined();
	});

	test("tolerates a path without the $ prefix", () => {
		expect(readPath({ a: 1 }, "a")).toBe(1);
	});
});

describe("credentialFetch", () => {
	test.each([
		"http://linear.app/oauth/token",
		"ftp://linear.app/token",
		"file:///etc/passwd",
	])("refuses %j", async (url) => {
		await expect(credentialFetch(url, {}, "token_url")).rejects.toThrow(
			/must be https/,
		);
	});

	test("refuses a value that is not a URL", async () => {
		await expect(credentialFetch("not a url", {}, "identity")).rejects.toThrow(
			/is not a URL/,
		);
	});

	test("refuses to follow a redirect rather than resend the credential", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(null, {
				status: 302,
				headers: { location: "https://attacker.test/collect" },
			})) as typeof fetch;

		try {
			await expect(
				credentialFetch("https://linear.app/oauth/token", {}, "token_url"),
			).rejects.toThrow(/attacker\.test/);
		} finally {
			globalThis.fetch = original;
		}
	});

	test("passes a plain https response through", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
			})) as typeof fetch;

		try {
			const response = await credentialFetch(
				"https://linear.app/oauth/token",
				{},
				"token_url",
			);
			expect(response.status).toBe(200);
		} finally {
			globalThis.fetch = original;
		}
	});
});
