import { afterEach, describe, expect, test } from "bun:test";
import { buildTree, routeCommand } from "@superset/cli-framework";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import workspacesMeta from "../meta";
import archiveCommand from "./command";

let deleteInputs: Record<string, unknown>[] = [];
let branchDeletedFor: (id: unknown) => boolean = () => true;

withLocalHostService("org-archive-test", {
	"workspace.delete": (input) => {
		deleteInputs.push(input);
		return {
			success: true,
			warnings: [],
			branchDeleted: input.deleteBranch === true && branchDeletedFor(input.id),
		};
	},
});

afterEach(() => {
	deleteInputs = [];
	branchDeletedFor = () => true;
});

function archiveOnHost(
	ids: string[],
	options: { deleteBranch?: boolean } = {},
) {
	return archiveCommand.run({
		ctx: {
			config: { organizationId: "org-archive-test" },
			bearer: "bearer",
		} as never,
		args: { ids } as never,
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	});
}

describe("workspaces archive", () => {
	test("archives cloud workspaces", async () => {
		const archivedIds: string[] = [];
		const ctx = {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: true }) },
					delete: {
						mutate: async ({ id }: { id: string }) => {
							archivedIds.push(id);
							return { deleted: true };
						},
					},
				},
			},
			config: { organizationId: "org-archive-test" },
		} as never;

		const result = await archiveCommand.run({
			ctx,
			args: { ids: ["ws-1"] } as never,
			options: {} as never,
			signal: new AbortController().signal,
		});

		expect(archivedIds).toEqual(["ws-1"]);
		expect(result).toEqual({
			data: { deleted: ["ws-1"] },
			message: "Archived cloud workspace ws-1",
		});
	});

	test("keeps the branch on a host by default", async () => {
		const result = await archiveOnHost(["ws-1"]);

		expect(deleteInputs).toEqual([{ id: "ws-1", deleteBranch: false }]);
		expect(result).toEqual({
			data: { deleted: ["ws-1"], branchesDeleted: [], warnings: [] },
			message: "Archived workspace ws-1",
		});
	});

	test("forwards --delete-branch to the host and reports the branch", async () => {
		const result = await archiveOnHost(["ws-1"], { deleteBranch: true });

		expect(deleteInputs).toEqual([{ id: "ws-1", deleteBranch: true }]);
		expect(result).toEqual({
			data: { deleted: ["ws-1"], branchesDeleted: ["ws-1"], warnings: [] },
			message: "Archived workspace ws-1 (branch deleted)",
		});
	});

	test("reports branches the host could not delete", async () => {
		// An older host ignores the flag, and a git failure only clears
		// branchDeleted: the workspace is archived either way.
		branchDeletedFor = (id) => id === "ws-1";

		const result = await archiveOnHost(["ws-1", "ws-2"], {
			deleteBranch: true,
		});

		expect(result).toMatchObject({
			data: { deleted: ["ws-1", "ws-2"], branchesDeleted: ["ws-1"] },
			message: "Archived 2 workspaces (1/2 branches deleted)",
		});
	});

	test("rejects --delete-branch for cloud workspaces before archiving", async () => {
		const archivedIds: string[] = [];
		const ctx = {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: true }) },
					delete: {
						mutate: async ({ id }: { id: string }) => {
							archivedIds.push(id);
							return { deleted: true };
						},
					},
				},
			},
			config: { organizationId: "org-archive-cloud" },
		} as never;

		await expect(
			archiveCommand.run({
				ctx,
				args: { ids: ["ws-1"] } as never,
				options: { deleteBranch: true } as never,
				signal: new AbortController().signal,
			}),
		).rejects.toThrow(/--delete-branch only applies to workspaces on a host/);
		expect(archivedIds).toEqual([]);
	});

	test("delete still routes to archive", () => {
		const { root, commandMap } = buildTree(
			[{ path: ["workspaces"], ...workspacesMeta }],
			[{ path: ["workspaces", "archive"], command: archiveCommand as never }],
		);

		for (const group of ["workspaces", "ws"]) {
			const routed = routeCommand(root, [group, "delete", "ws-1"]);
			expect(routed.commandPath).toEqual(["workspaces", "archive"]);
			expect(routed.remainingArgs).toEqual(["ws-1"]);
		}
		expect(commandMap.get("workspaces/archive")).toBe(archiveCommand as never);
	});
});
