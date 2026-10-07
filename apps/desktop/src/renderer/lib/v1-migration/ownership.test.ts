import { describe, expect, test } from "bun:test";
import type { V1MigrationIpc, V1ProjectRow } from "./ipc";
import type { V1LedgerOutcome, V1LedgerRow } from "./ledger";
import {
	OWNED_BY_OTHER_ORGANIZATION,
	scopeV1MigrationIpc,
	type V1LedgerOwner,
} from "./ownership";
import { planV1AutoPass } from "./pass";

function project(id: string): V1ProjectRow {
	return {
		id,
		name: id,
		mainRepoPath: `/repos/${id}`,
		githubOwner: null,
		color: "default",
		hideImage: null,
		worktreeBaseDir: null,
		branchPrefixMode: null,
		branchPrefixCustom: null,
	};
}

function makeIpc(owners: V1LedgerOwner[]) {
	const ledger = new Map<string, V1LedgerRow[]>();
	const writes: Array<{ organizationId: string; entries: V1LedgerOutcome[] }> =
		[];
	const ipc: V1MigrationIpc = {
		readV1Projects: async () => [project("p1"), project("p2")],
		readV1Workspaces: async () => [
			{ id: "w1", projectId: "p1", worktreeId: "t1", name: "w1", branch: "a" },
			{ id: "w2", projectId: "p2", worktreeId: "t2", name: "w2", branch: "b" },
		],
		readV1Worktrees: async () => [
			{ id: "t1", path: "/wt/1", baseBranch: null },
			{ id: "t2", path: "/wt/2", baseBranch: null },
		],
		readV1Groups: async () => [
			{ id: "g1", projectId: "p1", name: "g1", color: null, tabOrder: 0 },
		],
		readV1TerminalPanes: async () => [
			{ paneId: "pane1", v1WorkspaceId: "w1", cwd: null },
			{ paneId: "pane2", v1WorkspaceId: "w2", cwd: null },
		],
		resolvePaths: async (paths) => paths,
		readV1Settings: async () => null,
		readV1TerminalPresets: async () => [],
		ledgerList: async (organizationId) => ledger.get(organizationId) ?? [],
		ledgerRecord: async (organizationId, entries) => {
			writes.push({ organizationId, entries });
			const rows = ledger.get(organizationId) ?? [];
			for (const e of entries) {
				rows.push({
					v1Id: e.v1Id,
					kind: e.kind,
					status: e.status,
					v2Id: e.v2Id ?? null,
					reason: e.reason ?? null,
				});
			}
			ledger.set(organizationId, rows);
		},
		ledgerOwners: async () => owners,
	};
	return { ipc, writes };
}

describe("scopeV1MigrationIpc", () => {
	test("a project another org migrated is left out with its workspaces, groups and panes", async () => {
		const { ipc, writes } = makeIpc([
			{ organizationId: "org-a", v1Id: "p1", kind: "project" },
		]);
		const { ipc: scoped, leftOut } = await scopeV1MigrationIpc(ipc, "org-b");
		expect(leftOut).toBe(2);

		expect((await scoped.readV1Projects()).map((p) => p.id)).toEqual(["p2"]);
		expect((await scoped.readV1Workspaces()).map((w) => w.id)).toEqual(["w2"]);
		expect(await scoped.readV1Groups()).toEqual([]);
		expect((await scoped.readV1TerminalPanes()).map((p) => p.paneId)).toEqual([
			"pane2",
		]);
		expect(writes).toEqual([
			{
				organizationId: "org-b",
				entries: [
					{
						v1Id: "p1",
						kind: "project",
						status: "skipped",
						reason: OWNED_BY_OTHER_ORGANIZATION,
					},
					{
						v1Id: "w1",
						kind: "workspace",
						status: "skipped",
						reason: OWNED_BY_OTHER_ORGANIZATION,
					},
				],
			},
		]);

		await scopeV1MigrationIpc(ipc, "org-b");
		expect(writes).toHaveLength(1);
	});

	test("the owning org and an org that also holds the item keep it", async () => {
		const { ipc, writes } = makeIpc([
			{ organizationId: "org-a", v1Id: "p1", kind: "project" },
			{ organizationId: "org-a", v1Id: "w2", kind: "workspace" },
			{ organizationId: "org-b", v1Id: "w2", kind: "workspace" },
		]);
		const { ipc: ownerView } = await scopeV1MigrationIpc(ipc, "org-a");
		expect(await ownerView.readV1Projects()).toHaveLength(2);
		expect(await ownerView.readV1Workspaces()).toHaveLength(2);

		const { ipc: sharedView } = await scopeV1MigrationIpc(ipc, "org-b");
		expect((await sharedView.readV1Workspaces()).map((w) => w.id)).toEqual([
			"w2",
		]);
		expect(writes.every((w) => w.organizationId === "org-b")).toBe(true);
	});

	test("an org whose v1 data all belongs to another org gets a quiet pass", async () => {
		const { ipc } = makeIpc([
			{ organizationId: "org-a", v1Id: "p1", kind: "project" },
			{ organizationId: "org-a", v1Id: "p2", kind: "project" },
		]);
		const scoped = await scopeV1MigrationIpc(ipc, "org-b");
		expect(await scoped.ipc.readV1Projects()).toEqual([]);
		expect(await scoped.ipc.readV1Workspaces()).toEqual([]);
		const plan = (migrationComplete: boolean) =>
			planV1AutoPass({
				...scoped,
				organizationId: "org-b",
				followUpPending: false,
				migrationComplete,
			});

		expect(await plan(false)).toEqual({ pass: "full", showsProgress: false });
		expect(await plan(true)).toEqual({
			pass: "groups-only",
			showsProgress: false,
		});
	});
});
