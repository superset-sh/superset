import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHarness } from "./test-harness";

const harness = createHarness();

mock.module("../../../define-tool", () => ({
	defineTool: harness.defineTool,
}));
mock.module("../../../host-service-client", () => ({
	hostServiceCall: harness.hostServiceCall,
}));

const mod = await import("./add");
const tool = harness.register(mod);

beforeEach(() => {
	harness.calls.length = 0;
	harness.setResponse({});
});

describe("agents_presets_add", () => {
	test("is a non-destructive tool named for preset CRUD", () => {
		expect(tool.name).toBe("agents_presets_add");
		expect(tool.annotations).toEqual({ destructiveHint: false });
	});

	test("sends a structured command with the host's defaults filled in", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			label: "Claude",
			command: "claude",
			args: ["--dangerously-skip-permissions"],
		});

		expect(harness.calls).toEqual([
			{
				hostId: "host-1",
				procedure: "settings.agentConfigs.add",
				method: "mutation",
				input: {
					label: "Claude",
					command: "claude",
					args: ["--dangerously-skip-permissions"],
					promptTransport: "argv",
					promptArgs: [],
					env: {},
					presetId: undefined,
				},
			},
		]);
	});

	test("splits launchCommand into binary and args", async () => {
		await harness.invoke(tool, {
			hostId: "host-1",
			label: "Codex",
			launchCommand: "codex  --full-auto --sandbox danger",
			promptTransport: "stdin",
			promptArgs: ["-p"],
			env: { CODEX_HOME: "/tmp/codex" },
			presetId: "codex",
		});

		expect(harness.calls[0]?.input).toEqual({
			label: "Codex",
			command: "codex",
			args: ["--full-auto", "--sandbox", "danger"],
			promptTransport: "stdin",
			promptArgs: ["-p"],
			env: { CODEX_HOME: "/tmp/codex" },
			presetId: "codex",
		});
	});

	test("rejects a call that gives both launch shapes", async () => {
		await expect(
			harness.invoke(tool, {
				hostId: "host-1",
				label: "Claude",
				command: "claude",
				launchCommand: "claude --resume",
			}),
		).rejects.toThrow(
			"Pass either command (with optional args) or launchCommand, not both.",
		);
		expect(harness.calls).toEqual([]);
	});

	test("rejects a launchCommand that tokenizes to nothing", async () => {
		await expect(
			harness.invoke(tool, {
				hostId: "host-1",
				label: "Claude",
				launchCommand: "   ",
			}),
		).rejects.toThrow("launchCommand is empty");
		expect(harness.calls).toEqual([]);
	});

	test("rejects a call that gives no command at all", async () => {
		await expect(
			harness.invoke(tool, { hostId: "host-1", label: "Claude" }),
		).rejects.toThrow("Provide command");
		expect(harness.calls).toEqual([]);
	});

	test("rejects args without a command to attach them to", async () => {
		await expect(
			harness.invoke(tool, {
				hostId: "host-1",
				label: "Claude",
				args: ["--resume"],
			}),
		).rejects.toThrow("args must be passed together with command.");
		expect(harness.calls).toEqual([]);
	});

	test("returns the created config from the host", async () => {
		harness.setResponse({ id: "config-1", label: "Claude" });

		expect(
			await harness.invoke(tool, {
				hostId: "host-1",
				label: "Claude",
				command: "claude",
			}),
		).toEqual({ id: "config-1", label: "Claude" });
	});
});
