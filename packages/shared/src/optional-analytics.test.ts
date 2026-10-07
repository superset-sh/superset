import { expect, test } from "bun:test";
import {
	createOptionalAnalytics,
	isAnalyticsEnabled,
} from "./optional-analytics";

for (const key of [
	undefined,
	"",
	"   ",
	"build",
	"unused",
	"phc_local_dev_disabled",
]) {
	test(`analytics does not initialize for ${String(key)}`, async () => {
		const client = createOptionalAnalytics(key, () => {
			throw new Error("Disabled analytics constructed an SDK");
		});
		client.capture();
		expect(await client.isFeatureEnabled("cloud", "user")).toBeUndefined();
		expect(await client.getFeatureFlagPayload("menu", "user")).toBeUndefined();
		await client.flush();
	});
}
test("configured analytics preserves the SDK instance and key", () => {
	const sdk = { capture: () => "sent" };
	const client = createOptionalAnalytics("phc_configured", (key) => {
		expect(key).toBe("phc_configured");
		return sdk;
	});
	expect(client).toBe(sdk);
	expect(client.capture()).toBe("sent");
	expect(isAnalyticsEnabled("phc_configured")).toBe(true);
});
