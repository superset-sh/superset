import { describe, expect, it } from "bun:test";

import {
	getIntegrationStatuses,
	getMissingIntegrations,
} from "./integration-status";

describe("integration status", () => {
	it("reports configured and missing integrations from the supplied env", () => {
		const statuses = getIntegrationStatuses({
			STRIPE_SECRET_KEY: "sk_test",
			RESEND_API_KEY: "",
			NEXT_PUBLIC_POSTHOG_KEY: undefined,
		});

		expect(statuses.stripe).toBe("configured");
		expect(statuses.resend).toBe("missing");
		expect(statuses.posthog).toBe("missing");
		expect(statuses["upstash-kv"]).toBe("missing");
		expect(statuses.blob).toBe("missing");
	});

	it("requires all env vars for multi-key integrations", () => {
		expect(
			getIntegrationStatuses({
				KV_REST_API_URL: "https://example.upstash.io",
			})["upstash-kv"],
		).toBe("missing");

		expect(
			getIntegrationStatuses({
				KV_REST_API_URL: "https://example.upstash.io",
				KV_REST_API_TOKEN: "token",
			})["upstash-kv"],
		).toBe("configured");
	});

	it("returns missing integrations with display labels for boot output", () => {
		const missing = getMissingIntegrations({
			STRIPE_SECRET_KEY: "sk_test",
		});

		expect(missing.some(({ key }) => key === "stripe")).toBe(false);
		expect(missing).toContainEqual({
			key: "blob",
			label: "vercel-blob (uploads)",
			envVars: ["BLOB_READ_WRITE_TOKEN"],
		});
	});
});
