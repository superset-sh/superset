import { describe, expect, it } from "bun:test";
import { resolveExternalApiUrl } from "./external-api-url";

describe("resolveExternalApiUrl", () => {
	it("falls back to the local API URL when no external URL is configured", () => {
		expect(
			resolveExternalApiUrl({
				apiUrl: "http://localhost:3001",
				path: "/api/integrations/linear/callback",
			}),
		).toBe("http://localhost:3001/api/integrations/linear/callback");
	});

	it("prefers the external API URL for inbound callbacks", () => {
		expect(
			resolveExternalApiUrl({
				apiUrl: "http://localhost:3001",
				externalApiUrl: "https://superset-dev.example.com",
				path: "/api/integrations/linear/callback",
			}),
		).toBe("https://superset-dev.example.com/api/integrations/linear/callback");
	});

	it("returns the resolved base URL when no path is provided", () => {
		expect(
			resolveExternalApiUrl({
				apiUrl: "http://localhost:3001",
				externalApiUrl: "https://superset-dev.example.com",
			}),
		).toBe("https://superset-dev.example.com");
	});
});
