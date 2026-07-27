import { afterEach, describe, expect, mock, test } from "bun:test";

// Control what `workspace.delete.mutate` does per test. The command imports
// the host-target helpers from the lib barrel, so mock that module before
// importing the SUT.
type DeleteImpl = (id: string) => Promise<{ warnings?: string[] }>;
let deleteImpl: DeleteImpl = async () => ({ warnings: [] });
let attempted: string[] = [];

mock.module("../../../lib/host-target", () => ({
	resolveHostFilter: () => "host-1",
	resolveHostTarget: () => ({
		kind: "local",
		hostId: "host-1",
		client: {
			workspace: {
				delete: {
					mutate: async ({ id }: { id: string }) => {
						attempted.push(id);
						return deleteImpl(id);
					},
				},
			},
		},
	}),
}));

const { default: deleteCommand } = await import("./command");

function notFoundError(): Error {
	return Object.assign(new Error("Workspace not found"), {
		data: { code: "NOT_FOUND" },
	});
}

function invoke(ids: string[]) {
	return deleteCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
			authSource: "oauth",
		} as never,
		args: { ids } as never,
		options: {} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	deleteImpl = async () => ({ warnings: [] });
	attempted = [];
});

describe("workspaces delete", () => {
	test("deletes every workspace when all succeed", async () => {
		const result = (await invoke(["ws-1", "ws-2"])) as {
			data: Record<string, unknown>;
			message: string;
		};
		expect(attempted).toEqual(["ws-1", "ws-2"]);
		expect(result.data.deleted).toEqual(["ws-1", "ws-2"]);
		expect(result.data.notFound).toEqual([]);
		expect(result.data.failed).toEqual([]);
		expect(result.message).toBe("Deleted 2 workspaces");
	});

	test("continues deleting remaining IDs when one is not found and exits zero", async () => {
		deleteImpl = async (id) => {
			if (id === "ws-stale") throw notFoundError();
			return { warnings: [] };
		};
		const result = (await invoke(["ws-stale", "ws-2", "ws-3"])) as {
			data: Record<string, unknown>;
			message: string;
		};
		expect(attempted).toEqual(["ws-stale", "ws-2", "ws-3"]);
		expect(result.data.deleted).toEqual(["ws-2", "ws-3"]);
		expect(result.data.notFound).toEqual(["ws-stale"]);
		expect(result.data.failed).toEqual([]);
		expect(result.message).toContain("Deleted 2 workspaces");
		expect(result.message).toContain("Not found (already deleted)");
		expect(result.message).toContain("- ws-stale");
	});

	test("processes every ID and exits non-zero when a delete genuinely fails", async () => {
		deleteImpl = async (id) => {
			if (id === "ws-broken") throw new Error("worktree removal failed");
			return { warnings: [] };
		};
		const promise = invoke(["ws-1", "ws-broken", "ws-3"]);
		await expect(promise).rejects.toThrow(/Failed to delete/);
		await expect(promise).rejects.toThrow(/ws-broken: worktree removal failed/);
		await expect(promise).rejects.toThrow(/Deleted 2 workspaces/);
		expect(attempted).toEqual(["ws-1", "ws-broken", "ws-3"]);
	});

	test("surfaces per-workspace warnings on success", async () => {
		deleteImpl = async (id) =>
			id === "ws-1" ? { warnings: ["branch left behind"] } : { warnings: [] };
		const result = (await invoke(["ws-1", "ws-2"])) as { message: string };
		expect(result.message).toContain("Warnings:");
		expect(result.message).toContain("- ws-1: branch left behind");
	});
});
