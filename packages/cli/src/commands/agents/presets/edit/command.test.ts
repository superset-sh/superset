import { afterEach, describe, expect, mock, test } from "bun:test";

let updateInput: Record<string, unknown> | undefined;

mock.module("../../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			settings: {
				agentConfigs: {
					update: {
						mutate: async (input: Record<string, unknown>) => {
							updateInput = input;
							return { id: input.id, label: "Claude Sonnet" };
						},
					},
				},
			},
		},
	}),
}));

const { default: editPresetCommand } = await import("./command");

function invoke(options: Record<string, unknown>) {
	return editPresetCommand.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: { id: "config-1" } as never,
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	updateInput = undefined;
});

describe("agents presets edit", () => {
	test("patches only the fields that were passed", async () => {
		await invoke({ label: "Renamed" });

		expect(updateInput).toEqual({
			id: "config-1",
			patch: { label: "Renamed" },
		});
	});

	test("replaces the args along with the binary on --command", async () => {
		await invoke({ command: "codex --sandbox danger-full-access" });

		expect(updateInput).toEqual({
			id: "config-1",
			patch: {
				command: "codex",
				args: ["--sandbox", "danger-full-access"],
			},
		});
	});

	test("patches prompt transport, prompt args, and env together", async () => {
		await invoke({
			promptTransport: "stdin",
			promptArg: ["-p", "--"],
			env: ["API_BASE=https://example.test/v1?x=1"],
		});

		expect(updateInput).toEqual({
			id: "config-1",
			patch: {
				promptTransport: "stdin",
				promptArgs: ["-p", "--"],
				env: { API_BASE: "https://example.test/v1?x=1" },
			},
		});
	});

	test("rejects an edit that names no field", async () => {
		await expect(invoke({})).rejects.toThrow(/Nothing to update/);
		expect(updateInput).toBeUndefined();
	});

	test("rejects a whitespace-only --command", async () => {
		await expect(invoke({ command: "  " })).rejects.toThrow(
			/--command is empty/,
		);
		expect(updateInput).toBeUndefined();
	});
});
