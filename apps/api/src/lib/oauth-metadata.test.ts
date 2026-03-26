import { describe, expect, it } from "bun:test";
import {
	buildProtectedResourceMetadata,
	getOAuthProtectedResourceMetadataUrl,
	getRequestOrigin,
	normalizeResourcePath,
} from "./oauth-metadata";

describe("oauth metadata helpers", () => {
	it("prefers forwarded origin headers", () => {
		const request = new Request("http://internal/api/agent/mcp", {
			headers: {
				"x-forwarded-host": "api.superset.sh",
				"x-forwarded-proto": "https",
			},
		});

		expect(getRequestOrigin(request)).toBe("https://api.superset.sh");
	});

	it("uses the first forwarded host and proto values when proxies append lists", () => {
		const request = new Request("http://internal/api/agent/mcp", {
			headers: {
				"x-forwarded-host": "api.superset.sh, internal.example",
				"x-forwarded-proto": "https, http",
			},
		});

		expect(getRequestOrigin(request)).toBe("https://api.superset.sh");
	});

	it("builds a path-specific protected resource metadata URL", () => {
		const request = new Request("https://api.superset.sh/api/agent/mcp");

		expect(getOAuthProtectedResourceMetadataUrl(request)).toBe(
			"https://api.superset.sh/.well-known/oauth-protected-resource/api/agent/mcp",
		);
	});

	it("normalizes root and nested resource paths", () => {
		expect(normalizeResourcePath("/")).toBe("");
		expect(normalizeResourcePath("api/agent/mcp")).toBe("/api/agent/mcp");
		expect(normalizeResourcePath("/api/agent/mcp")).toBe("/api/agent/mcp");
	});

	it("builds protected resource metadata with optional fields", () => {
		const request = new Request("https://api.superset.sh/anything");

		expect(
			buildProtectedResourceMetadata(request, "/api/agent/mcp", {
				authorizationServerUrl: "https://api.superset.sh",
				resourceName: "Superset MCP Server",
				scopesSupported: ["profile", "email"],
			}),
		).toEqual({
			resource: "https://api.superset.sh/api/agent/mcp",
			authorization_servers: ["https://api.superset.sh"],
			resource_name: "Superset MCP Server",
			scopes_supported: ["profile", "email"],
		});
	});
});
