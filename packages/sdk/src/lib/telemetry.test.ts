import { describe, expect, test } from "bun:test";
import {
	buildCaptureRequest,
	buildMethodCalledEvent,
	resolveTelemetryKey,
} from "./telemetry";

const event = buildMethodCalledEvent({
	method: "tasks.list",
	target: "cloud",
	success: true,
	durationMs: 12,
});

function bodyOf(credential: string, organizationId: string | null) {
	const { init } = buildCaptureRequest({
		key: "phc_test",
		event,
		credential,
		organizationId,
	});
	return JSON.parse(String(init.body));
}

describe("SDK telemetry", () => {
	test("reports to production only for the production API", () => {
		expect(resolveTelemetryKey("https://api.superset.sh")).toStartWith("phc_");
		expect(resolveTelemetryKey("https://api.invalid")).toBeNull();
	});

	test("an API key is reported anonymously under its organization", () => {
		const body = bodyOf("sk_live_abc", "org-1");
		expect(body.distinct_id).not.toBe("sk_live_abc");
		expect(body.properties).toMatchObject({
			method: "tasks.list",
			source: "sdk",
			$groups: { organization: "org-1" },
		});
		expect(bodyOf("sk_live_other", null).distinct_id).toBe(body.distinct_id);
	});

	test("a session token is reported as its user", () => {
		const token = `h.${Buffer.from(JSON.stringify({ sub: "user-1" })).toString("base64url")}.s`;
		const body = bodyOf(token, null);
		expect(body.distinct_id).toBe("user-1");
	});
});
