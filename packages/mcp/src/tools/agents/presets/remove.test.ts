import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHarness } from "./test-harness";

const harness = createHarness();

mock.module("../../../define-tool", () => ({
	defineTool: harness.defineTool,
}));
mock.module("../../../host-service-client", () => ({
	hostServiceCall: harness.hostServiceCall,
}));

const mod = await import("./remove");
const tool = harness.register(mod);

beforeEach(() => {
	harness.calls.length = 0;
	harness.setResponse({ success: true });
});

describe("agents_presets_remove", () => {
	test("is flagged destructive", () => {
		expect(tool.name).toBe("agents_presets_remove");
		expect(tool.annotations).toEqual({ destructiveHint: true });
	});

	test("deletes the row and echoes the id back", async () => {
		const result = await harness.invoke(tool, {
			hostId: "host-1",
			id: "config-1",
		});

		expect(harness.calls).toEqual([
			{
				hostId: "host-1",
				procedure: "settings.agentConfigs.remove",
				method: "mutation",
				input: { id: "config-1" },
			},
		]);
		expect(result).toEqual({ id: "config-1", success: true });
	});

	test("surfaces a host failure instead of reporting success", async () => {
		harness.setFailure(new Error("Host agent config not found: config-9"));

		await expect(
			harness.invoke(tool, { hostId: "host-1", id: "config-9" }),
		).rejects.toThrow("Host agent config not found: config-9");
	});
});
