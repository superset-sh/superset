import { describe, expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import type {
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
	id: string;
	projectId: string;
	branch: string;
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
						const main = this.workspaces.find(
							(w) => w.projectId === projectId && w.branch === "main",
						);
						return {
							mainWorkspaceId: main?.id ?? null,
							repoPath: project.repoPath,
						};
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
						const main = {
							id: this.id("v2w"),
							projectId: project.id,
							branch: "main",
						};
						this.workspaces.push(main);
						return {
							projectId: project.id,
							mainWorkspaceId: main.id,
							repoPath: project.repoPath,
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
			workspace: { list: { query: async () => [...this.workspaces] } },
			workspaceCreation: {
				listProjectWorktrees: {
					query: async ({ projectId }: { projectId: string }) => {
						const project = this.projects.find((p) => p.id === projectId);
						const branches = project
							? (this.diskBranches.get(project.repoPath) ?? new Set())
							: new Set<string>();
						return {
							worktrees: [...branches].map((branch) => ({ branch })),
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
	projects: V1ProjectRow[] = [];
	workspaces: V1WorkspaceRow[] = [];
	worktrees: V1WorktreeRow[] = [];
	ledger = new Map<string, V1LedgerRow>();
	/** kind\0v1Id → every status ever recorded, for monotonicity checks. */
	ledgerHistory = new Map<string, string[]>();
	failNextLedgerRecords = 0;

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
		expect(first.workspaces.migrated).toBe(1); // feat adopted
		expect(first.workspaces.linked).toBe(1); // main pre-created by the import
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
				args: { projectId: "v2p-5", icon: "none" },
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
