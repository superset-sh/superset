import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHarness } from "./test-harness";

const harness = createHarness();

mock.module("../../../define-tool", () => ({
	defineTool: harness.defineTool,
}));
mock.module("../../../host-service-client", () => ({
	hostServiceCall: harness.hostServiceCall,
}));

const mod = await import("./edit");
const tool = harness.register(mod);

beforeEach(() => {
	harness.calls.length = 0;
	harness.setResponse({});
});

describe("agents_presets_edit", () => {
	test("is a non-destructive, idempotent tool", () => {
		expect(tool.name).toBe("agents_presets_edit");
		expect(tool.annotations).toEqual({
			destructiveHint: false,
			idempotentHint: true,
		});
	});

	test("patches only the fields the caller passed", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			id: "config-1",
			label: "Claude (yolo)",
			env: { ANTHROPIC_MODEL: "opus" },
		});

		expect(harness.calls).toEqual([
			{
				hostId: "host-1",
				procedure: "settings.agentConfigs.update",
				method: "mutation",
				input: {
					id: "config-1",
					patch: {
						label: "Claude (yolo)",
						env: { ANTHROPIC_MODEL: "opus" },
					},
				},
			},
		]);
	});

	test("replaces command and args as a pair", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			id: "config-1",
			command: "claude",
			args: ["--permission-mode", "plan"],
		});

		expect(harness.calls[0]?.input).toEqual({
			id: "config-1",
			patch: { command: "claude", args: ["--permission-mode", "plan"] },
		});
	});

	test("clears stored args when a command arrives without them", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			id: "config-1",
			command: "claude",
		});

		expect(harness.calls[0]?.input).toEqual({
			id: "config-1",
			patch: { command: "claude", args: [] },
		});
	});

	test("splits launchCommand into the command and args pair", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			id: "config-1",
			launchCommand: "codex --full-auto",
		});

		expect(harness.calls[0]?.input).toEqual({
			id: "config-1",
			patch: { command: "codex", args: ["--full-auto"] },
		});
	});

	test("rejects a patch that gives both launch shapes", async () => {
		await expect(
			harness.invoke(tool, {
				hostId: "host-1",
				id: "config-1",
				command: "claude",
				launchCommand: "codex --full-auto",
			}),
		).rejects.toThrow(
			"Pass either command (with optional args) or launchCommand, not both.",
		);
		expect(harness.calls).toEqual([]);
	});

	test("refuses an empty patch without calling the host", async () => {
		await expect(
			harness.invoke(tool, { hostId: "host-1", id: "config-1" }),
		).rejects.toThrow("Nothing to update");
		expect(harness.calls).toEqual([]);
	});

	test("passes an emptied promptArgs and env through as a real change", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			id: "config-1",
			promptArgs: [],
			env: {},
		});

		expect(harness.calls[0]?.input).toEqual({
			id: "config-1",
			patch: { promptArgs: [], env: {} },
		});
	});

	test("returns the updated config from the host", async () => {
		harness.setResponse({ id: "config-1", label: "Claude (yolo)" });

		expect(
			await harness.invoke(tool, {
				hostId: "host-1",
				id: "config-1",
				label: "Claude (yolo)",
			}),
		).toEqual({ id: "config-1", label: "Claude (yolo)" });
	});
});
