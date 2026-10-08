import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTree, routeCommand } from "@superset/cli-framework";

const previousHome = process.env.SUPERSET_HOME_DIR;
const home = mkdtempSync(join(tmpdir(), "superset-ws-archive-"));
process.env.SUPERSET_HOME_DIR = home;

const { default: archiveCommand } = await import("./command");
const { default: workspacesMeta } = await import("../meta");

afterAll(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
});

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
