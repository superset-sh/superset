import { afterEach, describe, expect, mock, test } from "bun:test";

let addInput: Record<string, unknown> | undefined;

mock.module("../../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			settings: {
				agentConfigs: {
					add: {
						mutate: async (input: Record<string, unknown>) => {
							addInput = input;
							return { id: "config-1", label: input.label };
						},
					},
				},
			},
		},
	}),
}));

const { default: addPresetCommand } = await import("./command");

function invoke(overrides: Record<string, unknown> = {}) {
	return addPresetCommand.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: {} as never,
		options: {
			label: "Claude Sonnet",
			command: "claude --model claude-sonnet-4-6",
			promptTransport: "argv",
			local: true,
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	addInput = undefined;
});

describe("agents presets add", () => {
	test("splits --command into the binary and its args", async () => {
		await invoke();

		expect(addInput).toEqual({
			label: "Claude Sonnet",
			command: "claude",
			args: ["--model", "claude-sonnet-4-6"],
			promptTransport: "argv",
			promptArgs: [],
			env: {},
			presetId: undefined,
		});
	});

	test("forwards prompt args, env pairs, and a preset tag", async () => {
		await invoke({
			promptTransport: "stdin",
			promptArg: ["-p"],
			env: ["ANTHROPIC_LOG=debug", "NO_COLOR="],
			presetId: "claude-sonnet",
		});

		expect(addInput).toMatchObject({
			promptTransport: "stdin",
			promptArgs: ["-p"],
			env: { ANTHROPIC_LOG: "debug", NO_COLOR: "" },
			presetId: "claude-sonnet",
		});
	});

	test("reports the new id so a script can launch it", async () => {
		const result = (await invoke()) as {
			data: { id: string };
			message: string;
		};

		expect(result.data.id).toBe("config-1");
		expect(result.message).toContain("--agent config-1");
	});

	test("rejects a whitespace-only --command", async () => {
		await expect(invoke({ command: "   " })).rejects.toThrow(
			/--command is empty/,
		);
		expect(addInput).toBeUndefined();
	});

	test("rejects a malformed --env pair", async () => {
		await expect(invoke({ env: ["OOPS"] })).rejects.toThrow(
			/Invalid --env value/,
		);
		expect(addInput).toBeUndefined();
	});
});
