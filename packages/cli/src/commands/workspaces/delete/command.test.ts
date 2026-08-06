import { afterEach, describe, expect, mock, test } from "bun:test";

let deleteInputs: Record<string, unknown>[] = [];
let branchDeletedByInput: (input: Record<string, unknown>) => boolean = (
	input,
) => input.deleteBranch === true;

// `spawn.test.ts` replaces `node:child_process` with a spawn-only stub and bun
// leaks module mocks across files in the same process, so importing the real
// host-info (which pulls `execFileSync`) would break at load time. The host is
// resolved through the mocked host-target below anyway.
mock.module("@superset/shared/host-info", () => ({
	getHostId: () => "host-1",
}));

// See the note in agents/create/command.test.ts: leaked module mocks make a
// partial barrel mock break unrelated files, so mirror the full surface.
mock.module("../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostFilter: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			workspace: {
				delete: {
					mutate: async (input: Record<string, unknown>) => {
						deleteInputs.push(input);
						return {
							success: true,
							cloudDeleted: true,
							worktreeRemoved: true,
							branchDeleted: branchDeletedByInput(input),
							warnings: [],
						};
					},
				},
			},
		},
	}),
}));

const { default: deleteWorkspaceCommand } = await import("./command");

/** Narrows the command's `data | array | void` return to the data/message
 *  shape this command always produces. */
async function invoke(ids: string[], options: { deleteBranch?: boolean } = {}) {
	const result = await deleteWorkspaceCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: { ids } as never,
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	});
	if (!result || Array.isArray(result)) {
		throw new Error("workspaces delete must return a data/message result");
	}
	return result;
}

afterEach(() => {
	deleteInputs = [];
	branchDeletedByInput = (input) => input.deleteBranch === true;
});

describe("workspaces delete", () => {
	test("keeps the branch by default", async () => {
		const result = await invoke(["ws_a"]);

		expect(deleteInputs).toEqual([{ id: "ws_a", deleteBranch: false }]);
		expect(result.data).toMatchObject({
			deleted: ["ws_a"],
			branchesDeleted: [],
		});
		// No branch annotation when the flag wasn't passed: "0/1 branches
		// deleted" would read as a failure.
		expect(result.message).toBe("Deleted workspace ws_a");
	});

	test("forwards --delete-branch to every workspace on the host", async () => {
		const result = await invoke(["ws_a", "ws_b"], { deleteBranch: true });

		expect(deleteInputs).toEqual([
			{ id: "ws_a", deleteBranch: true },
			{ id: "ws_b", deleteBranch: true },
		]);
		expect(result.data).toMatchObject({
			deleted: ["ws_a", "ws_b"],
			branchesDeleted: ["ws_a", "ws_b"],
		});
		expect(result.message).toBe("Deleted 2 workspaces (2/2 branches deleted)");
	});

	test("reports how many branches the host actually deleted", async () => {
		// Branch cleanup runs after the workspace is already deleted, so a git
		// failure only clears `branchDeleted` — the workspace still counts as
		// deleted.
		branchDeletedByInput = (input) => input.id === "ws_a";

		const result = await invoke(["ws_a", "ws_b"], { deleteBranch: true });

		expect(result.data).toMatchObject({
			deleted: ["ws_a", "ws_b"],
			branchesDeleted: ["ws_a"],
		});
		expect(result.message).toBe("Deleted 2 workspaces (1/2 branches deleted)");
	});
});
