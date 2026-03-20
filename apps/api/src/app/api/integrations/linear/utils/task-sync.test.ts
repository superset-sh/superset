import { describe, expect, it } from "bun:test";
import {
	buildLegacyLinearWebhookEventId,
	buildLinearWebhookEventId,
} from "./task-sync";

describe("buildLinearWebhookEventId", () => {
	it("returns a SHA-256 hex string", () => {
		const result = buildLinearWebhookEventId('{"test": "body"}');
		expect(result).toMatch(/^[a-f0-9]{64}$/);
	});

	it("returns the same hash for the same body", () => {
		const body = '{"action":"create","data":{"id":"123"}}';
		const a = buildLinearWebhookEventId(body);
		const b = buildLinearWebhookEventId(body);
		expect(a).toBe(b);
	});

	it("returns different hashes for different bodies", () => {
		const a = buildLinearWebhookEventId('{"action":"create"}');
		const b = buildLinearWebhookEventId('{"action":"update"}');
		expect(a).not.toBe(b);
	});

	it("returns a different value than the legacy format", () => {
		const body = '{"organizationId":"org-1","webhookTimestamp":1234567890}';
		const newId = buildLinearWebhookEventId(body);
		const legacyId = buildLegacyLinearWebhookEventId({
			organizationId: "org-1",
			webhookTimestamp: 1234567890,
		});
		expect(newId).not.toBe(legacyId);
	});
});

describe("buildLegacyLinearWebhookEventId", () => {
	it("returns orgId-timestamp format", () => {
		const result = buildLegacyLinearWebhookEventId({
			organizationId: "org-abc",
			webhookTimestamp: 1710000000,
		});
		expect(result).toBe("org-abc-1710000000");
	});

	it("is deterministic", () => {
		const args = { organizationId: "org-1", webhookTimestamp: 999 };
		expect(buildLegacyLinearWebhookEventId(args)).toBe(
			buildLegacyLinearWebhookEventId(args),
		);
	});
});
