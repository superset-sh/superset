import { describe, expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { owesFullPass } from "./attention";
import type {
	V1GroupRow,
	V1MigrationIpc,
	V1ProjectRow,
	V1WorkspaceRow,
	V1WorktreeRow,
} from "./ipc";
import type { V1LedgerOutcome, V1LedgerRow } from "./ledger";
import { planV2SurfacePass } from "./pass";
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
	worktreePath?: string;
}

/** Symlinks and case-insensitive spellings: path → real path. */
type Aliases = Map<string, string>;

const notFound = (message: string) =>
	Object.assign(new Error(message), { data: { code: "NOT_FOUND" } });

class FakeHost {
	omitWorktreePaths = false;
	projects: HostProject[] = [];
	workspaces: HostWorkspace[] = [];
	/** repoPath → branches that exist on disk under that project. */
	diskBranches = new Map<string, Set<string>>();
	/** branch → path git lists it at; default `/disk/<branch>`. */
	worktreePaths = new Map<string, string>();
	aliases: Aliases = new Map();
	/** repoPath → error message create/setup should throw (broken repos). */
	brokenRepos = new Map<string, string>();
	/** Repo paths that no longer exist on disk (findByPath 400s). */
	missingPaths = new Set<string>();
	/** Existing folders that are not git repos (findByPath → needsGitInit). */
	nonGitPaths = new Set<string>();
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

	private gitPath(branch: string): string {
		return this.worktreePaths.get(branch) ?? `/disk/${branch}`;
	}

	private real(path: string): string {
		return this.aliases.get(path) ?? path;
	}

	/** Mirrors host adopt: path mode reads the branch, then conflict cleanup. */
	private adoptRow(args: {
		projectId: string;
		repoPath: string;
		branch: string;
		worktreePath?: string;
	}): { workspace: HostWorkspace; alreadyExists: boolean } {
		const onDisk = [...(this.diskBranches.get(args.repoPath) ?? [])]
			.filter((branch) => branch !== "main")
			.map((branch) => ({ branch, path: this.gitPath(branch) }));
		const target = args.worktreePath
			? onDisk.find(
					(w) => this.real(w.path) === this.real(args.worktreePath as string),
				)
			: onDisk.find((w) => w.branch === args.branch);
		if (!target && args.worktreePath) {
			throw notFound(`No git worktree registered at "${args.worktreePath}"`);
		}
		const branch = target?.branch ?? args.branch;
		const path = args.worktreePath ?? target?.path ?? this.gitPath(branch);
		const rows = this.workspaces.filter(
			(w) => w.projectId === args.projectId && w.type !== "local",
		);
		const byBranch = rows.find((w) => w.branch === branch);
		if (byBranch && byBranch.worktreePath === path) {
			return { workspace: byBranch, alreadyExists: true };
		}
		const byPath = rows.find((w) => w.worktreePath === path);
		const keepId = byPath?.id ?? this.id("v2w");
		for (const conflict of rows) {
			if (conflict.id === keepId) continue;
			if (conflict.branch !== branch && conflict.worktreePath !== path) {
				continue;
			}
			this.mutations.push({ kind: "workspace.delete", args: conflict.id });
			this.workspaces = this.workspaces.filter((w) => w.id !== conflict.id);
		}
		if (byPath) {
			byPath.branch = branch;
			return { workspace: byPath, alreadyExists: true };
		}
		const row: HostWorkspace = {
			tags: [],
			id: keepId,
			projectId: args.projectId,
			branch,
			worktreePath: path,
		};
		this.workspaces.push(row);
		return { workspace: row, alreadyExists: false };
	}

	client(): HostServiceClient {
		return {
			project: {
				findByPath: {
					query: async ({ repoPath }: { repoPath: string }) => {
						if (this.missingPaths.has(repoPath)) {
							throw new Error(`Path does not exist: ${repoPath}`);
						}
						if (this.nonGitPaths.has(repoPath)) {
							return { candidates: [], cloudErrors: [], needsGitInit: true };
						}
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
						if (this.nonGitPaths.has(mode.repoPath)) {
							throw new Error(`Not a git repository: ${mode.repoPath}`);
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
								path: this.omitWorktreePaths
									? undefined
									: branch === "main" && project
										? project.repoPath
										: this.gitPath(branch),
								hasWorkspace: this.workspaces.some(
									(w) =>
										w.projectId === projectId &&
										(w.branch === branch ||
											w.worktreePath === this.gitPath(branch)),
								),
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
						worktreePath?: string;
					}) => {
						if (this.adoptFaults > 0) {
							this.adoptFaults--;
							throw new Error("host transient adopt failure");
						}
						const owner = this.projects.find((p) => p.id === args.projectId);
						if (!owner) throw new Error("Project is not set up on this host");
						if (this.missingPaths.has(owner.repoPath)) {
							throw new Error(
								"Project directory is no longer a directory on disk",
							);
						}
						const result = this.adoptRow({
							...args,
							repoPath: owner.repoPath,
						});
						this.mutations.push({ kind: "workspaceCreation.adopt", args });
						return result;
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
	/** Folders that exist on disk without being an adoptable worktree. */
	existingPaths = new Set<string>();
	aliases: Aliases = new Map();

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
	async resolvePaths(paths: string[]) {
		return paths.map((p) => {
			const alias = this.aliases.get(p);
			if (alias) return alias;
			return p.startsWith("/disk/") || this.existingPaths.has(p) ? p : null;
		});
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

const runOnV1 = (ipc: FakeIpc, host: FakeHost) =>
	runV1Migration({
		organizationId: "org",
		hostClient: host.client(),
		ipc,
		reconcileWithHost: true,
	});

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

	test("pre-account v1 data on a machine already on v2: every workspace reaches the board", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [
			{ id: "wt1", path: "/trees/feat-a", baseBranch: "main" },
			{ id: "wt2", path: "/trees/feat-b", baseBranch: "main" },
		];
		ipc.workspaces = [
			workspace("w-main", "p1", "main"),
			workspace("w-feat-a", "p1", "feat-a", "wt1"),
			workspace("w-feat-b", "p1", "feat-b", "wt2"),
		];
		host.diskBranches.set("/repo/a", new Set(["main", "feat-a", "feat-b"]));
		// File -> Open Project on v2 already made the project and its default
		// "main" workspace; the ledger is empty because no pass ever ran.
		host.projects.push({ id: "v2p-open", repoPath: "/repo/a" });
		host.workspaces.push({
			tags: [],
			id: "v2w-open",
			projectId: "v2p-open",
			branch: "main",
			type: "local",
		});
		expect(
			planV2SurfacePass({
				followUpPending: false,
				migrationComplete: false,
				hasV1Data: ipc.projects.length + ipc.workspaces.length > 0,
			}),
		).toBe("full");

		const adopted: string[] = [];
		const first = await runV1Migration({
			organizationId: "org",
			hostClient: host.client(),
			ipc,
			onWorkspaceAdopted: (id) => adopted.push(id),
		});

		expect(first.projects.linked).toBe(1);
		expect(host.projects).toHaveLength(1);
		expect(first.workspaces.linked).toBe(1);
		expect(first.workspaces.migrated).toBe(2);
		expect(first.gateComplete).toBe(true);

		const board = await host.client().workspace.list.query();
		expect(
			board
				.filter((w) => w.projectId === "v2p-open")
				.map((w) => w.branch)
				.sort(),
		).toEqual(["feat-a", "feat-b", "main"]);
		expect(adopted).toHaveLength(2);
		for (const v1Id of ["w-main", "w-feat-a", "w-feat-b"]) {
			expect(ipc.ledger.get(`workspace\0${v1Id}`)?.v2Id).toBeTruthy();
		}

		const mutationsAfterFirst = host.mutations.length;
		await run(ipc, host);
		expect(host.mutations.length).toBe(mutationsAfterFirst);
		expect(host.workspaces).toHaveLength(3);
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

	test("repo whose path is gone is skipped, not failed: gate completes; restoring the path imports it later", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [
			project("good", "/repo/good"),
			project("gone", "/repo/gone"),
		];
		ipc.workspaces = [workspace("w-gone", "gone", "feat")];
		host.missingPaths.add("/repo/gone");

		const first = await run(ipc, host);
		expect(first.projects.migrated).toBe(1);
		expect(first.projects.failed).toBe(0);
		expect(first.projects.skipped).toBe(1);
		expect(first.workspaces.failed).toBe(0);
		expect(first.workspaces.skipped).toBe(1);
		expect(first.gateComplete).toBe(true);
		expect(ipc.ledger.get("project\0gone")).toMatchObject({
			status: "skipped",
			reason: "repo-path-missing",
		});

		host.missingPaths.clear(); // user restored the folder
		const second = await run(ipc, host);
		expect(second.projects.migrated).toBe(1);
		expect(ipc.ledger.get("project\0gone")?.status).toBe("success");
	});

	test("folder that is no longer a git repo is skipped without a create call", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("plain", "/repo/plain")];
		host.nonGitPaths.add("/repo/plain");

		const summary = await run(ipc, host);
		expect(summary.projects.skipped).toBe(1);
		expect(summary.projects.failed).toBe(0);
		expect(summary.gateComplete).toBe(true);
		expect(host.mutations).toHaveLength(0);
		expect(ipc.ledger.get("project\0plain")).toMatchObject({
			status: "skipped",
			reason: "not-a-git-repo",
		});
	});

	test("on v1, a ledger row pointing at a project the host no longer has is re-imported, not trusted", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [{ id: "wt1", path: "/trees/feat", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["feat"]));

		const first = await runOnV1(ipc, host);
		expect(first.gateComplete).toBe(true);
		const staleV2Id = ipc.ledger.get("project\0p1")?.v2Id;
		expect(staleV2Id).toBeTruthy();

		// host.db wiped or rebuilt: the v2 project id in the ledger is gone.
		host.projects = [];
		host.workspaces = [];

		const second = await runOnV1(ipc, host);
		expect(second.projects.migrated).toBe(1);
		expect(second.workspaces.failed).toBe(0);
		expect(second.workspaces.migrated).toBe(1);
		expect(second.gateComplete).toBe(true);
		expect(ipc.ledger.get("project\0p1")?.v2Id).not.toBe(staleV2Id);
		expect(host.projects).toHaveLength(1);
	});

	test("on v1, a re-imported project gets its v1 preferences applied again", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [
			{ ...project("p1", "/repo/a"), worktreeBaseDir: "/trees/custom" },
		];
		await runOnV1(ipc, host);
		const setsBefore = host.mutations.filter(
			(m) => m.kind === "project.setWorktreeBaseDir",
		);
		expect(setsBefore).toHaveLength(1);

		host.projects = [];
		host.workspaces = [];
		await runOnV1(ipc, host);

		const newV2Id = ipc.ledger.get("project\0p1")?.v2Id ?? "";
		expect(newV2Id).not.toBe("");
		const sets = host.mutations.filter(
			(m) => m.kind === "project.setWorktreeBaseDir",
		);
		expect(sets).toHaveLength(2);
		expect((sets[1]?.args as { projectId: string }).projectId).toBe(newV2Id);
		expect(ipc.ledger.get("settings\0project-prefs:p1")?.v2Id).toBe(newV2Id);
	});

	test("after the flip, a project the user deleted on v2 is not re-imported", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [{ id: "wt1", path: "/trees/feat", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["feat"]));
		await runOnV1(ipc, host);

		host.projects = [];
		host.workspaces = [];

		const followUp = await run(ipc, host); // v2 follow-up pass
		expect(followUp.projects.migrated).toBe(0);
		expect(followUp.workspaces.migrated).toBe(0);
		expect(host.projects).toHaveLength(0);
	});

	test("pending workspaces of a project the user removed on v2 are skipped, not failed", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		host.diskBranches.set("/repo/a", new Set(["main"]));
		await run(ipc, host);

		host.projects = [];
		ipc.worktrees = [{ id: "wt1", path: "/trees/late", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-late", "p1", "late", "wt1")];

		const summary = await run(ipc, host);
		expect(summary.workspaces.failed).toBe(0);
		expect(summary.gateComplete).toBe(true);
		expect(ipc.ledger.get("workspace\0w-late")).toMatchObject({
			status: "skipped",
			reason: "v2-project-removed",
		});
	});

	test("workspace of an imported project whose directory vanished is skipped, not failed", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		host.diskBranches.set("/repo/a", new Set(["feat"]));
		await runOnV1(ipc, host);

		ipc.worktrees = [{ id: "wt1", path: "/trees/feat", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.missingPaths.add("/repo/a"); // repo deleted after the import

		const summary = await runOnV1(ipc, host);
		expect(summary.workspaces.failed).toBe(0);
		expect(summary.workspaces.skipped).toBe(1);
		expect(summary.gateComplete).toBe(true);
		expect(ipc.ledger.get("workspace\0w-feat")).toMatchObject({
			status: "skipped",
			reason: "repo-path-missing",
		});
	});

	test("a worktree whose branch was switched in place adopts by its folder", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [{ id: "wt1", path: "/disk/feat-v2", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["main", "feat-v2"]));

		await run(ipc, host);
		expect(ipc.ledger.get("workspace\0w-feat")).toMatchObject({
			status: "success",
		});
	});

	test("a host that lists worktrees without paths still adopts by branch", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		host.omitWorktreePaths = true;
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [{ id: "wt1", path: "/trees/feat", baseBranch: "main" }];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["main", "feat"]));

		const summary = await run(ipc, host);
		expect(summary.workspaces.failed).toBe(0);
		expect(ipc.ledger.get("workspace\0w-feat")).toMatchObject({
			status: "success",
		});
	});

	test("a folder that still exists but cannot adopt is kept for attention", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [
			{ id: "wt1", path: "/trees/detached", baseBranch: "main" },
		];
		ipc.workspaces = [workspace("w-det", "p1", "detached", "wt1")];
		ipc.existingPaths.add("/trees/detached");
		host.diskBranches.set("/repo/a", new Set(["main"]));

		await run(ipc, host);
		expect(ipc.ledger.get("workspace\0w-det")).toMatchObject({
			status: "skipped",
			reason: "worktree-needs-attention",
		});
	});

	test("a symlinked, differently cased folder adopts under git's spelling of its path", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		const aliases: Aliases = new Map([
			["/Users/Me/trees/feat/", "/Volumes/Data/trees/feat"],
			["/link/trees/feat", "/Volumes/Data/trees/feat"],
		]);
		ipc.aliases = aliases;
		host.aliases = aliases;
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [
			{ id: "wt1", path: "/Users/Me/trees/feat/", baseBranch: "main" },
		];
		ipc.workspaces = [workspace("w-feat", "p1", "feat", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["main", "feat-v2"]));
		host.worktreePaths.set("feat-v2", "/link/trees/feat");
		host.projects.push({ id: "v2p-a", repoPath: "/repo/a" });
		// A v2 row already tracks the folder under its old branch name.
		host.workspaces.push({
			tags: [],
			id: "v2w-existing",
			projectId: "v2p-a",
			branch: "feat",
			worktreePath: "/link/trees/feat",
		});

		await run(ipc, host);

		expect(ipc.ledger.get("workspace\0w-feat")).toMatchObject({
			status: "success",
			v2Id: "v2w-existing",
		});
		expect(host.workspaces.filter((w) => w.type !== "local")).toEqual([
			expect.objectContaining({
				id: "v2w-existing",
				branch: "feat-v2",
				worktreePath: "/link/trees/feat",
			}),
		]);
	});

	test("a worktree moved and renamed after v1 stays visible and is never adopted as another", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [
			{ id: "wt-moved", path: "/old/feat", baseBranch: "main" },
			{ id: "wt-renamed", path: "/old/fix", baseBranch: "main" },
		];
		ipc.workspaces = [
			workspace("w-moved", "p1", "feat", "wt-moved"),
			workspace("w-renamed", "p1", "fix", "wt-renamed"),
		];
		host.diskBranches.set("/repo/a", new Set(["main", "feat", "fix-2"]));

		await run(ipc, host);

		expect(ipc.ledger.get("workspace\0w-moved")?.status).toBe("success");
		expect(ipc.ledger.get("workspace\0w-renamed")).toMatchObject({
			status: "skipped",
			reason: "worktree-needs-attention",
		});
		expect(host.workspaces.map((w) => w.branch)).toEqual(["feat"]);
	});

	test("duplicate v1 projects and workspaces on one branch share one v2 row each", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		const aliases: Aliases = new Map([
			["/v1/trees/feat", "/real/trees/feat"],
			["/disk/feat", "/real/trees/feat"],
		]);
		ipc.aliases = aliases;
		host.aliases = aliases;
		ipc.projects = [project("p1", "/repo/a"), project("p2", "/repo/a")];
		ipc.worktrees = [
			{ id: "wt1", path: "/v1/trees/feat", baseBranch: "main" },
			{ id: "wt2", path: "/v1/trees/gone", baseBranch: "main" },
		];
		ipc.workspaces = [
			workspace("w1-main", "p1", "main"),
			workspace("w2-main", "p2", "main"),
			workspace("w1-feat", "p1", "feat", "wt1"),
			workspace("w2-feat", "p2", "feat", "wt2"),
		];
		host.diskBranches.set("/repo/a", new Set(["main", "feat"]));

		const summary = await run(ipc, host);

		expect(summary.workspaces.failed).toBe(0);
		expect(host.mutations.map((m) => m.kind)).not.toContain("workspace.delete");
		expect(host.workspaces.map((w) => w.branch).sort()).toEqual([
			"feat",
			"main",
		]);
		const v2Id = (v1Id: string) => ipc.ledger.get(`workspace\0${v1Id}`)?.v2Id;
		expect(v2Id("w1-main")).toBeTruthy();
		expect(v2Id("w2-main")).toBe(v2Id("w1-main"));
		expect(v2Id("w1-feat")).toBeTruthy();
		expect(v2Id("w2-feat")).toBe(v2Id("w1-feat"));

		const mutations = host.mutations.length;
		await run(ipc, host);
		expect(host.mutations.length).toBe(mutations);
	});

	test("an unmounted worktree with a stale branch that matches the checkout is retried, not merged into it", async () => {
		const ipc = new FakeIpc();
		const host = new FakeHost();
		ipc.projects = [project("p1", "/repo/a")];
		ipc.worktrees = [
			{ id: "wt1", path: "/Volumes/ext/feat", baseBranch: "main" },
		];
		// v1 last saw "main" here; the folder has since moved to "feat".
		ipc.workspaces = [workspace("w-ext", "p1", "main", "wt1")];
		host.diskBranches.set("/repo/a", new Set(["main"]));

		await run(ipc, host);
		expect(ipc.ledger.get("workspace\0w-ext")).toMatchObject({
			status: "skipped",
			reason: "no-worktree-on-disk",
		});
		expect(host.mutations.map((m) => m.kind)).not.toContain(
			"workspaces.create",
		);

		// Drive mounted again: git lists the worktree.
		ipc.aliases.set("/Volumes/ext/feat", "/disk/feat");
		host.diskBranches.set("/repo/a", new Set(["main", "feat"]));
		expect(
			await owesFullPass({
				ledgerRows: [...ipc.ledger.values()],
				v1Projects: ipc.projects,
				v1Workspaces: ipc.workspaces,
				v1Worktrees: ipc.worktrees,
				resolvePaths: (paths) => ipc.resolvePaths(paths),
			}),
		).toBe(true);
		await run(ipc, host);
		expect(ipc.ledger.get("workspace\0w-ext")?.status).toBe("success");
		expect(host.workspaces.map((w) => w.branch)).toEqual(["feat"]);
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
