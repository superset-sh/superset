import { describe, expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import type {
	V1GroupRow,
	V1MigrationIpc,
	V1ProjectRow,
	V1WorkspaceRow,
	V1WorktreeRow,
} from "./ipc";
import type { V1LedgerOutcome, V1LedgerRow } from "./ledger";
import { runV1Migration } from "./runV1Migration";

// ---------------------------------------------------------------------------
// Fakes. The fake host implements the exact call surface the migrator uses,
// with link-first semantics mirroring host-service (findByPath by repo path,
// adopt reuses (projectId, branch) rows). It records every mutation — the
// invariant suite asserts on that log. There is deliberately NO delete
// anywhere: a migrator regression that tries to delete would throw.
// ---------------------------------------------------------------------------

interface HostProject {
	id: string;
	repoPath: string;
}
interface HostWorkspace {
	tags: string[];
	id: string;
	projectId: string;
	branch: string;
	type?: "local" | "worktree";
}

class FakeHost {
	projects: HostProject[] = [];
	workspaces: HostWorkspace[] = [];
	/** repoPath → branches that exist on disk under that project. */
	diskBranches = new Map<string, Set<string>>();
	/** repoPath → error message create/setup should throw (broken repos). */
	brokenRepos = new Map<string, string>();
	/** Throw the next N adopt calls (transient host fault). */
	adoptFaults = 0;
	tagFaults = 0;
	folders: Array<{
		scope: string;
		tag: string;
		displayName: string;
		color: string | null;
		tabOrder: number;
	}> = [];
	mutations: Array<{ kind: string; args: unknown }> = [];
	private seq = 0;

	private id(prefix: string): string {
		return `${prefix}-${++this.seq}`;
	}

	client(): HostServiceClient {
		return {
			project: {
				findByPath: {
					query: async ({ repoPath }: { repoPath: string }) => {
						const local = this.projects.find((p) => p.repoPath === repoPath);
						return {
							candidates: local ? [{ id: local.id, source: "local-path" }] : [],
							cloudErrors: [],
						};
					},
				},
				setup: {
					mutate: async ({ projectId }: { projectId: string }) => {
						const project = this.projects.find((p) => p.id === projectId);
						if (!project) throw new Error("Project not found");
						if (this.brokenRepos.has(project.repoPath)) {
							throw new Error(this.brokenRepos.get(project.repoPath));
						}
						this.mutations.push({ kind: "project.setup", args: projectId });
						return { repoPath: project.repoPath };
					},
				},
				create: {
					mutate: async ({
						name,
						mode,
					}: {
						name: string;
						mode: { repoPath: string };
					}) => {
						if (this.brokenRepos.has(mode.repoPath)) {
							throw new Error(this.brokenRepos.get(mode.repoPath));
						}
						this.mutations.push({ kind: "project.create", args: name });
						const project = { id: this.id("v2p"), repoPath: mode.repoPath };
						this.projects.push(project);
						return {
							projectId: project.id,
							repoPath: project.repoPath,
							created: true,
						};
					},
				},
				list: { query: async () => [...this.projects] },
				get: {
					query: async ({ projectId }: { projectId: string }) =>
						this.projects.some((p) => p.id === projectId)
							? {
									worktreeBaseDir: null,
									branchPrefixMode: null,
									branchPrefixCustom: null,
								}
							: null,
				},
				setColor: {
					mutate: async (args: unknown) => {
						this.mutations.push({ kind: "project.setColor", args });
					},
				},
				setIcon: {
					mutate: async (args: unknown) => {
						this.mutations.push({ kind: "project.setIcon", args });
					},
				},
				setWorktreeBaseDir: {
					mutate: async (args: unknown) => {
						this.mutations.push({ kind: "project.setWorktreeBaseDir", args });
					},
				},
				setBranchPrefix: {
					mutate: async (args: unknown) => {
						this.mutations.push({ kind: "project.setBranchPrefix", args });
					},
				},
			},
			settings: {
				branchPrefix: {
					get: { query: async () => ({ mode: "none", customPrefix: null }) },
					set: {
						mutate: async (args: unknown) => {
							this.mutations.push({ kind: "settings.branchPrefix.set", args });
						},
					},
				},
			},

			tagFolders: {
				list: { query: async () => this.folders },
				upsert: {
					mutate: async (args: FakeHost["folders"][number]) => {
						if (args.displayName.length > 200)
							throw new Error("Display name too long");
						this.folders = this.folders.filter(
							(f) => f.scope !== args.scope || f.tag !== args.tag,
						);
						this.folders.push(args);
					},
				},
			},
			workspace: {
				list: { query: async () => this.workspaces.map((w) => ({ ...w })) },
				update: {
					mutate: async (args: { id: string; tags: string[] }) => {
						if (this.tagFaults-- > 0) throw new Error("tag write failed");
						const row = this.workspaces.find((w) => w.id === args.id);
						if (!row) throw new Error("missing workspace");
						row.tags = args.tags;
						this.mutations.push({ kind: "workspace.update", args });
					},
				},
			},
			workspaces: {
				createLocal: {
					mutate: async (args: {
						projectId: string;
						checkout: "local";
						name: string;
					}) => {
						this.mutations.push({ kind: "workspaces.create", args });
						const row: HostWorkspace = {
							tags: [],
							id: this.id("v2w"),
							projectId: args.projectId,
							branch: "main",
							type: "local",
						};
						this.workspaces.push(row);
						return { workspace: row, alreadyExists: false };
					},
				},
			},
			workspaceCreation: {
				listProjectWorktrees: {
					query: async ({ projectId }: { projectId: string }) => {
						const project = this.projects.find((p) => p.id === projectId);
						const branches = project
							? (this.diskBranches.get(project.repoPath) ?? new Set())
							: new Set<string>();
						return {
							worktrees: [...branches].map((branch) => ({
								branch,
								isMainWorktree: branch === "main",
							})),
						};
					},
				},
				adopt: {
					mutate: async (args: {
						projectId: string;
						workspaceName: string;
						branch: string;
					}) => {
						if (this.adoptFaults > 0) {
							this.adoptFaults--;
							throw new Error("host transient adopt failure");
						}
						this.mutations.push({ kind: "workspaceCreation.adopt", args });
						const existing = this.workspaces.find(
							(w) => w.projectId === args.projectId && w.branch === args.branch,
						);
						if (existing) return { workspace: existing, alreadyExists: true };
						const row = {
							tags: [],
							id: this.id("v2w"),
							projectId: args.projectId,
							branch: args.branch,
						};
						this.workspaces.push(row);
						return { workspace: row, alreadyExists: false };
					},
				},
			},
		} as unknown as HostServiceClient;
	}
}

class FakeIpc implements V1MigrationIpc {
	groups: V1GroupRow[] = [];
	projects: V1ProjectRow[] = [];
	workspaces: V1WorkspaceRow[] = [];
	worktrees: V1WorktreeRow[] = [];
	ledger = new Map<string, V1LedgerRow>();
	/** kind\0v1Id → every status ever recorded, for monotonicity checks. */
	ledgerHistory = new Map<string, string[]>();
	failNextLedgerRecords = 0;

	async readV1Groups() {
		return this.groups;
	}
	async readV1Projects() {
		return [...this.projects];
	}
	async readV1Workspaces() {
		return [...this.workspaces];
	}
	async readV1Worktrees() {
		return [...this.worktrees];
	}
	async readV1Settings() {
		return null;
	}
	async readV1TerminalPanes() {
		return [];
	}
	async readV1TerminalPresets() {
		return [];
	}
	async ledgerList() {
		return [...this.ledger.values()];
	}
	async ledgerRecord(_organizationId: string, entries: V1LedgerOutcome[]) {
		if (this.failNextLedgerRecords > 0) {
			this.failNextLedgerRecords--;
			throw new Error("ledger write failed");
		}
		for (const entry of entries) {
			const key = `${entry.kind}\0${entry.v1Id}`;
			this.ledger.set(key, {
				v1Id: entry.v1Id,
				kind: entry.kind,
				status: entry.status,
				v2Id: entry.v2Id ?? null,
				reason: entry.reason ?? null,
			});
			this.ledgerHistory.set(key, [
				...(this.ledgerHistory.get(key) ?? []),
				entry.status,
			]);
		}
	}
}

const project = (
	id: string,
	repoPath: string,
	color = "default",
	hideImage: boolean | null = null,
): V1ProjectRow => ({
	id,
	name: id,
	mainRepoPath: repoPath,
	githubOwner: null,
	color,
	hideImage,
	worktreeBaseDir: null,
	branchPrefixMode: null,
	branchPrefixCustom: null,
});

const workspace = (
	id: string,
	projectId: string,
	branch: string,
	worktreeId: string | null = null,
): V1WorkspaceRow => ({ id, projectId, worktreeId, name: id, branch });

const run = (ipc: FakeIpc, host: FakeHost) =>
	runV1Migration({ organizationId: "org", hostClient: host.client(), ipc });

// ---------------------------------------------------------------------------

describe("runV1Migration scenarios", () => {
	test("fresh pass migrates everything; second pass mutates nothing", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a"), project("p2", "/repo/b")];
		ipc.worktrees = [{ id: "wt1", path: "/trees/feat", baseBranch: "main" }];
		ipc.workspaces = [
			workspace("w-main", "p1", "main"),
			workspace("w-feat", "p1", "feat", "wt1"),
			workspace("w-gone", "p1", "stale"), // no worktree on disk
		];
		host.diskBranches.set("/repo/a", new Set(["main", "feat"]));

		const first = await run(ipc, host);
		expect(first.projects.migrated).toBe(2);
		expect(first.workspaces.migrated).toBe(2); // feat adopted, main-repo workspace created as local
		expect(first.workspaces.linked).toBe(0);
		expect(first.workspaces.skipped).toBe(1); // stale: no worktree on disk
		expect(first.gateComplete).toBe(true); // skips don't block (F1)

		const mutationsAfterFirst = host.mutations.length;
		const second = await run(ipc, host);
		expect(host.mutations.length).toBe(mutationsAfterFirst); // zero new mutations
		expect(second.workspaces.skipped).toBe(1); // stale re-skips, still non-blocking
		expect(second.gateComplete).toBe(true);
	});

	test("custom v1 color and hide-image carry over; defaults do not", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [
			project("colored", "/repo/a", "#ef4444"),
			project("plain", "/repo/b"), // "default" sentinel, no hideImage
			project("hidden", "/repo/c", "default", true),
		];

		const summary = await run(ipc, host);
		expect(summary.projects.migrated).toBe(3);
		expect(host.mutations.filter((m) => m.kind === "project.setColor")).toEqual(
			[
				{
					kind: "project.setColor",
					args: { projectId: "v2p-1", color: "#ef4444" },
				},
			],
		);
		expect(host.mutations.filter((m) => m.kind === "project.setIcon")).toEqual([
			{
				kind: "project.setIcon",
				args: { projectId: "v2p-3", icon: "none" },
			},
		]);
	});

	test("broken repo blocks the gate but not other entities; recovery unblocks", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("good", "/repo/good"), project("bad", "/repo/bad")];
		host.brokenRepos.set(
			"/repo/bad",
			"Repository is in detached-HEAD state. Check out a branch.",
		);

		const first = await run(ipc, host);
		expect(first.projects.migrated).toBe(1);
		expect(first.projects.failed).toBe(1);
		expect(first.gateComplete).toBe(false);
		expect(ipc.ledger.get("project\0bad")?.status).toBe("error");
		expect(ipc.ledger.get("project\0good")?.status).toBe("success");

		host.brokenRepos.clear(); // user fixed the repo
		const second = await run(ipc, host);
		expect(second.projects.migrated).toBe(1); // only the retried one
		expect(second.gateComplete).toBe(true);
		expect(ipc.ledger.get("project\0bad")?.status).toBe("success");
	});

	test("transient adopt fault: error ledgered, retried next pass, no duplicates", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [{ id: "wt1", path: "/trees/feat", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["feat"]));
		host.adoptFaults = 1;

		const first = await run(ipc, host);
		expect(first.workspaces.failed).toBe(1);
		expect(first.gateComplete).toBe(false);

		const second = await run(ipc, host);
		expect(second.workspaces.migrated).toBe(1);
		expect(second.gateComplete).toBe(true);
		expect(host.workspaces.filter((w) => w.branch === "feat")).toHaveLength(1);
	});

	test("ledger write failure aborts the pass but committed host work is linked, not duplicated", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.failNextLedgerRecords = 2; // first flush + the finally-flush retry

		await expect(run(ipc, host)).rejects.toThrow("ledger write failed");
		expect(host.projects).toHaveLength(1); // create committed before the flush

		const second = await run(ipc, host);
		expect(second.projects.linked).toBe(1); // findByPath re-links, no second create
		expect(host.projects).toHaveLength(1);
		expect(ipc.ledger.get("project\0p1")?.status).toBe("linked");
	});

	test("onProjectImported callback failure never overwrites the success outcome", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];

		const summary = await runV1Migration({
			organizationId: "org",
			hostClient: host.client(),
			ipc,
			onProjectImported: () => {
				throw new Error("UI blew up");
			},
		});
		expect(summary.projects.migrated).toBe(1);
		expect(summary.gateComplete).toBe(true);
		expect(ipc.ledger.get("project\0p1")?.status).toBe("success");
	});

	test("no v1 data: gate trivially complete, zero mutations", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		const summary = await run(ipc, host);
		expect(summary.gateComplete).toBe(true);
		expect(host.mutations).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Invariant fuzz: random fixtures + transient faults, then assert the
// properties that must NEVER break, whatever the input.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ALLOWED_MUTATIONS = new Set([
	"project.setup",
	"project.create",
	"project.setWorktreeBaseDir",
	"project.setBranchPrefix",
	"settings.branchPrefix.set",
	"workspaceCreation.adopt",
	"workspaces.create",
]);

describe("runV1Migration invariants (seeded fuzz)", () => {
	test("no deletes, no duplicates, monotonic ledger, mutation-free fixpoint", async () => {
		for (let seed = 1; seed <= 40; seed++) {
			const rnd = mulberry32(seed);
			const ipc = new FakeIpc();
			const host = new FakeHost();

			const projectCount = Math.floor(rnd() * 5);
			for (let p = 0; p < projectCount; p++) {
				const repoPath = `/repo/${seed}-${p}`;
				ipc.projects.push(project(`p${p}`, repoPath));
				const disk = new Set<string>();
				host.diskBranches.set(repoPath, disk);
				if (rnd() < 0.3) {
					// repo already imported into v2 (link path)
					host.projects.push({ id: `pre-${seed}-${p}`, repoPath });
				}
				if (rnd() < 0.2) {
					host.brokenRepos.set(repoPath, `broken repo ${p}`); // transient: cleared below
				}
				const wsCount = Math.floor(rnd() * 4);
				for (let w = 0; w < wsCount; w++) {
					const branch = `br-${w}`;
					const hasWorktree = rnd() < 0.7;
					const wtId = hasWorktree ? `wt-${p}-${w}` : null;
					if (hasWorktree) {
						disk.add(branch);
						ipc.worktrees.push({
							id: wtId as string,
							path: `/trees/${seed}-${p}-${w}`,
							baseBranch: "main",
						});
					}
					ipc.workspaces.push(workspace(`w-${p}-${w}`, `p${p}`, branch, wtId));
				}
			}
			host.adoptFaults = rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0;
			if (rnd() < 0.2) ipc.failNextLedgerRecords = 1;

			// Up to 3 passes with faults live, then clear faults (transient) and
			// run to the fixpoint.
			for (let pass = 0; pass < 3; pass++) {
				await run(ipc, host).catch(() => {}); // ledger faults may abort a pass
			}
			host.brokenRepos.clear();
			host.adoptFaults = 0;
			ipc.failNextLedgerRecords = 0;
			const settled = await run(ipc, host);

			// (1) only known additive mutations, ever
			for (const m of host.mutations) {
				expect(ALLOWED_MUTATIONS.has(m.kind)).toBe(true);
			}
			// (2) no duplicate host rows
			const projectPaths = host.projects.map((p) => p.repoPath);
			expect(new Set(projectPaths).size).toBe(projectPaths.length);
			const wsKeys = host.workspaces.map((w) => `${w.projectId}\0${w.branch}`);
			expect(new Set(wsKeys).size).toBe(wsKeys.length);
			// (3) ledger monotonic: after success/linked, never downgraded
			for (const [key, history] of ipc.ledgerHistory) {
				const doneAt = history.findIndex(
					(s) => s === "success" || s === "linked",
				);
				if (doneAt === -1) continue;
				for (const later of history.slice(doneAt + 1)) {
					expect(
						later === "success" || later === "linked",
						`ledger downgraded for ${key} (seed ${seed}): ${history.join("→")}`,
					).toBe(true);
				}
			}
			// (4) all faults were transient → gate settles complete
			expect(settled.gateComplete).toBe(true);
			// (5) fixpoint: one more pass performs zero mutations
			const before = host.mutations.length;
			await run(ipc, host);
			expect(host.mutations.length).toBe(before);
		}
	});
});

describe("v1 groups to tags", () => {
	const setup = async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p", "/repo")];
		ipc.workspaces = [{ ...workspace("w", "p", "main"), sectionId: "g" }];
		// The repo root is always a worktree on its checked-out branch.
		host.diskBranches.set("/repo", new Set(["main"]));
		await run(ipc, host); // Backfill a migration that finished before groups existed.
		ipc.groups = [
			{
				id: "g",
				projectId: "p",
				name: "Review",
				color: "#ff0000",
				tabOrder: 3,
			},
		];
		return { ipc, host };
	};

	test("backfills existing workspaces, preserves tags and presentation, respects later v2 edits", async () => {
		const { ipc, host } = await setup();
		host.workspaces[0].tags = ["existing"];
		await run(ipc, host);
		expect(host.workspaces[0].tags).toEqual(["existing", "review"]);
		expect(host.folders[0]).toMatchObject({
			tag: "review",
			displayName: "Review",
			color: "#ff0000",
			tabOrder: 3,
		});
		host.workspaces[0].tags = ["existing"]; // user removes migrated membership
		host.folders[0].displayName = "Renamed";
		const writes = host.mutations.length;
		await run(ipc, host);
		expect(host.mutations.length).toBe(writes);
		expect(host.workspaces[0].tags).toEqual(["existing"]);
		expect(host.folders[0].displayName).toBe("Renamed");
	});

	test("reserves collision-free tags and reuses them after a rejected membership write", async () => {
		const { ipc, host } = await setup();
		host.workspaces[0].tags = ["review"];
		ipc.groups.push({ ...ipc.groups[0], id: "empty" });
		host.tagFaults = 1;
		expect((await run(ipc, host)).settings.failed).toBe(1);
		expect(host.folders.map((f) => f.tag)).toEqual(["review-2", "review-3"]);
		await run(ipc, host);
		expect(host.workspaces[0].tags).toEqual(["review", "review-2"]);
		expect(host.folders.map((f) => f.tag)).toEqual(["review-2", "review-3"]);
	});

	test("imports late members without recreating or retagging the group", async () => {
		const { ipc, host } = await setup();
		ipc.workspaces.push({ ...workspace("late", "p", "feat"), sectionId: "g" });
		host.diskBranches.set("/repo", new Set(["main", "feat"]));
		host.adoptFaults = 1;
		expect((await run(ipc, host)).settings.deferred).toBe(1);
		await run(ipc, host);
		expect(host.workspaces.find((w) => w.branch === "feat")?.tags).toEqual([
			"review",
		]);
		expect(host.folders).toHaveLength(1);
	});

	test("does not write host state when reserving the tag fails", async () => {
		const { ipc, host } = await setup();
		ipc.failNextLedgerRecords = 1;
		expect((await run(ipc, host)).settings.failed).toBe(1);
		expect(host.folders).toHaveLength(0);
		expect(host.workspaces[0].tags).toEqual([]);
		await run(ipc, host);
		expect(host.folders[0].tag).toBe("review");
	});

	test("retries local presentation after failure and seeds it only once", async () => {
		const { ipc, host } = await setup();
		ipc.groups[0].isCollapsed = true;
		const imported: unknown[] = [];
		let fail = true;
		const groupTarget = (group: V1GroupRow, projectId: string, tag: string) => {
			if (fail) throw new Error("local write failed");
			imported.push({ group, projectId, tag });
		};
		const pass = () =>
			runV1Migration({
				organizationId: "org",
				ipc,
				hostClient: host.client(),
				groupTarget,
			});
		expect((await pass()).settings.failed).toBe(1);
		fail = false;
		await pass();
		await pass();
		expect(imported).toHaveLength(1);
		expect(imported[0]).toMatchObject({
			group: { isCollapsed: true },
			tag: "review",
		});
		expect(host.folders).toHaveLength(1);
		expect(host.workspaces[0].tags).toEqual(["review"]);
	});

	test("imports unbounded v1 group names within the host display-name limit", async () => {
		const { ipc, host } = await setup();
		const original = `Long ${"x".repeat(220)}`;
		ipc.groups[0].name = original;
		expect((await run(ipc, host)).settings.failed).toBe(0);
		expect(host.folders[0].displayName).toBe(original.slice(0, 200));
		expect(ipc.groups[0].name).toBe(original);
		expect(host.workspaces[0].tags).toEqual([host.folders[0].tag]);
		await run(ipc, host);
		expect(host.folders).toHaveLength(1);
	});

	test("skips groups belonging to projects that were not migrated", async () => {
		const { ipc, host } = await setup();
		ipc.groups[0].projectId = "hidden";
		await run(ipc, host);
		expect(host.folders).toHaveLength(0);
		expect(host.workspaces[0].tags).toEqual([]);
	});
});
