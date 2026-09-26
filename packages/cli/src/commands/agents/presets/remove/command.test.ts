import { afterEach, describe, expect, mock, test } from "bun:test";

let removeInput: Record<string, unknown> | undefined;

mock.module("../../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			settings: {
				agentConfigs: {
					remove: {
						mutate: async (input: Record<string, unknown>) => {
							removeInput = input;
							return { success: true as const };
						},
					},
				},
			},
		},
	}),
}));

const { default: removePresetCommand } = await import("./command");

afterEach(() => {
	removeInput = undefined;
});

describe("agents presets remove", () => {
	test("deletes by id and echoes it back for --quiet", async () => {
		const result = (await removePresetCommand.run({
			ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
			args: { id: "config-1" } as never,
			options: { local: true } as never,
			signal: new AbortController().signal,
		})) as { data: { id: string } };

		expect(removeInput).toEqual({ id: "config-1" });
		expect(result.data).toEqual({ id: "config-1" });
	});
});
