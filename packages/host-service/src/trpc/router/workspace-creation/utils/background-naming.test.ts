import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { createBasicScenario } from "../../../../../test/helpers/scenarios";
import { projects, terminalSessions, workspaces } from "../../../../db/schema";
import { PullRequestRuntimeManager } from "../../../../runtime/pull-requests/pull-requests";
import {
	archiveLocalWorkspace,
	deleteLocalWorkspace,
	getLocalWorkspace,
	unarchiveLocalWorkspace,
	updateLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";
import * as agents from "../../agents";
import * as naming from "./ai-workspace-names";

const savedEnv = { ...process.env };
let stopPrStartup: ReturnType<typeof spyOn>;
let stopPrEvents: ReturnType<typeof spyOn>;
beforeAll(() => {
	stopPrStartup = spyOn(
		PullRequestRuntimeManager.prototype,
		"start",
	).mockImplementation(() => {});
	stopPrEvents = spyOn(
		PullRequestRuntimeManager.prototype,
		"subscribeToWorkspaceEvents",
	).mockImplementation(() => {});
	process.env.GIT_AUTHOR_NAME = "Test Runner";
	process.env.GIT_AUTHOR_EMAIL = "test@superset.sh";
	process.env.GIT_COMMITTER_NAME = "Test Runner";
	process.env.GIT_COMMITTER_EMAIL = "test@superset.sh";
});
afterAll(() => {
	stopPrStartup.mockRestore();
	stopPrEvents.mockRestore();
	for (const key of [
		"GIT_AUTHOR_NAME",
		"GIT_AUTHOR_EMAIL",
		"GIT_COMMITTER_NAME",
		"GIT_COMMITTER_EMAIL",
	]) {
		if (savedEnv[key] === undefined) delete process.env[key];
		else process.env[key] = savedEnv[key];
	}
});

async function until(check: () => boolean) {
	for (let i = 0; i < 200 && !check(); i++)
		await new Promise((resolve) => setTimeout(resolve, 10));
	expect(check()).toBe(true);
}

const title = {
	title: "Resolve login failures",
	branchName: "fix-login",
};

for (const kind of ["session", "worktree"] as const) {
	async function fixture() {
		const scenario = await createBasicScenario();
		const id = crypto.randomUUID();
		const deferred =
			Promise.withResolvers<naming.GeneratedWorkspaceNames | null>();
		const generator = spyOn(
			naming,
			"generateWorkspaceNamesFromPrompt",
		).mockReturnValue(deferred.promise);
		const row = () => getLocalWorkspace(scenario.host.db, id);
		const create = (
			extra: {
				name?: string;
				namingPrompt?: string;
				agents?: Array<{ agent: string; prompt: string }>;
				branch?: string;
			} = {},
		) =>
			kind === "session"
				? scenario.host.trpc.workspaces.createSession.mutate(
						{ id, namingPrompt: "Fix login", ...extra },
						{ signal: AbortSignal.timeout(5000) },
					)
				: scenario.host.trpc.workspaces.create.mutate(
						{
							id,
							projectId: scenario.projectId,
							namingPrompt: "Fix login",
							runSetup: false,
							...extra,
						},
						{ signal: AbortSignal.timeout(5000) },
					);
		return {
			...scenario,
			id,
			deferred,
			generator,
			row,
			create,
			cleanup: async () => {
				const path = row()?.worktreePath;
				deferred.resolve(null);
				await new Promise((resolve) => setTimeout(resolve, 0));
				generator.mockRestore();
				await scenario.dispose();
				if (kind === "session" && path)
					rmSync(path, { recursive: true, force: true });
			},
		};
	}

	test(`${kind}: creation returns before naming and keeps its folder when AI names arrive`, async () => {
		const f = await fixture();
		try {
			const result = await f.create({
				namingPrompt: "https://superset.sh please fix login",
			});
			expect(result.workspace.name).toMatch(
				/^[a-z]+-[a-z]+-[0-9a-f]{8}(?:-\d+)?$/,
			);
			expect(result.workspace.name).not.toContain("https");
			await until(() => f.generator.mock.calls.length === 1);
			const initial = f.row();
			if (!initial) throw new Error("Workspace row missing");
			const branch = initial.branch;
			expect(branch).toBe(kind === "session" ? "main" : result.workspace.name);
			expect(basename(initial.worktreePath)).toBe(result.workspace.name);
			f.deferred.resolve(title);
			await until(() => f.row()?.name === title.title);
			expect(f.row()?.worktreePath).toBe(initial.worktreePath);
			const expectedBranch =
				kind === "session" ? "main" : `${title.branchName}-${f.id.slice(0, 8)}`;
			expect(f.row()?.branch).toBe(expectedBranch);
			expect(
				execFileSync(
					"git",
					["-C", initial.worktreePath, "branch", "--show-current"],
					{ encoding: "utf8" },
				).trim(),
			).toBe(expectedBranch);
		} finally {
			await f.cleanup();
		}
	});

	test(`${kind}: empty composer still creates a valid initial name without AI`, async () => {
		const f = await fixture();
		try {
			const result = await f.create({ namingPrompt: undefined });
			expect(result.workspace.name).toMatch(
				/^[a-z]+-[a-z]+-[0-9a-f]{8}(?:-\d+)?$/,
			);
			expect(f.row()?.name).toBe(result.workspace.name);
			expect(result.workspace.branch).toBe(
				kind === "session" ? "main" : result.workspace.name,
			);
			expect(f.generator).not.toHaveBeenCalled();
		} finally {
			await f.cleanup();
		}
	});

	for (const edit of [
		"manual",
		"away-and-back",
		"archive",
		"archive-and-restore",
	] as const) {
		test(`${kind}: pending title cannot overwrite ${edit}`, async () => {
			const f = await fixture();
			try {
				const result = await f.create();
				await until(() => f.generator.mock.calls.length === 1);
				if (edit === "manual" || edit === "away-and-back") {
					updateLocalWorkspace(f.host, f.id, { name: "My title" });
					if (edit === "away-and-back")
						updateLocalWorkspace(f.host, f.id, { name: result.workspace.name });
				} else {
					archiveLocalWorkspace(f.host, f.id, "deleted");
					if (edit === "archive-and-restore")
						unarchiveLocalWorkspace(f.host, f.id);
				}
				f.deferred.resolve(title);
				await new Promise((resolve) => setTimeout(resolve, 20));
				expect(f.row()?.name).toBe(
					edit === "manual" ? "My title" : result.workspace.name,
				);
			} finally {
				await f.cleanup();
			}
		});
	}

	test(`${kind}: deleted workspace is not recreated by naming`, async () => {
		const f = await fixture();
		let path: string | undefined;
		try {
			await f.create();
			path = f.row()?.worktreePath;
			await until(() => f.generator.mock.calls.length === 1);
			deleteLocalWorkspace(f.host, f.id);
			f.deferred.resolve(title);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(f.row()).toBeUndefined();
		} finally {
			await f.cleanup();
			if (kind === "session" && path)
				rmSync(path, { recursive: true, force: true });
		}
	});

	test(`${kind}: explicit name skips AI naming`, async () => {
		const f = await fixture();
		try {
			const result = await f.create({ name: "My workspace" });
			expect(result.workspace.name).toBe("My workspace");
			expect(f.generator).not.toHaveBeenCalled();
		} finally {
			await f.cleanup();
		}
	});

	test(`${kind}: title failure leaves creation successful`, async () => {
		const f = await fixture();
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const result = await f.create();
			await until(() => f.generator.mock.calls.length === 1);
			f.deferred.reject(new Error("naming unavailable"));
			await until(() =>
				warn.mock.calls.some(
					(call) => call[0] === "[workspace-title] generation failed",
				),
			);
			expect(result.workspace.id).toBe(f.id);
			expect(f.row()?.name).toBe(result.workspace.name);
		} finally {
			await f.cleanup();
			warn.mockRestore();
		}
	});

	for (const resolveBeforeLaunchFinishes of [false, true]) {
		test(`${kind}: dispatch starts before naming; response includes names ready during startup (${resolveBeforeLaunchFinishes})`, async () => {
			const f = await fixture();
			const entered = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			const launch = spyOn(agents, "runAgentInWorkspace").mockImplementation(
				async () => {
					entered.resolve();
					await release.promise;
					return {
						kind: "terminal",
						sessionId: "test-agent",
						label: "Test agent",
					};
				},
			);
			let creation: ReturnType<typeof f.create> | undefined;
			try {
				creation = f.create({
					agents: [{ agent: "test-agent", prompt: "Fix login" }],
				});
				await entered.promise;
				expect(f.generator).not.toHaveBeenCalled();
				const host = launch.mock.calls[0]?.[0];
				if (!host) throw new Error("Launch missing");
				host.db
					.insert(terminalSessions)
					.values({ id: "test-agent", originWorkspaceId: f.id })
					.run();
				host.terminalAgentStore.recordEvent({
					terminalId: "test-agent",
					workspaceId: f.id,
					agentId: "claude",
					eventType: "Attached",
					occurredAt: Date.now(),
				});
				expect(f.generator).not.toHaveBeenCalled();
				host.terminalAgentStore.recordEvent({
					terminalId: "test-agent",
					workspaceId: f.id,
					agentId: "claude",
					eventType: "Start",
					occurredAt: Date.now(),
				});
				await until(() => f.generator.mock.calls.length === 1);
				const initialName = f.row()?.name;
				if (!initialName) throw new Error("Workspace missing");
				if (resolveBeforeLaunchFinishes) {
					f.deferred.resolve(title);
					await until(() => f.row()?.name === title.title);
				}
				release.resolve();
				const result = await creation;
				expect(result.agents[0]?.ok).toBe(true);
				expect(result.workspace.name).toBe(
					resolveBeforeLaunchFinishes ? title.title : initialName,
				);
				if (!resolveBeforeLaunchFinishes) {
					f.deferred.resolve(title);
					await until(() => f.row()?.name === title.title);
				}
			} finally {
				release.resolve();
				await creation?.catch(() => {});
				launch.mockRestore();
				await f.cleanup();
			}
		}, 15000);
	}

	for (const concurrent of [false, true]) {
		test(`${kind}: ${concurrent ? "concurrent" : "sequential"} same-ID retries reuse the workspace`, async () => {
			const f = await fixture();
			const launch = spyOn(agents, "runAgentInWorkspace").mockResolvedValue({
				kind: "terminal",
				sessionId: "test-agent",
				label: "Test agent",
			});
			try {
				const input = {
					agents: [{ agent: "test-agent", prompt: "Fix login" }],
				};
				const first = f.create(input);
				if (!concurrent) await first;
				const results = await Promise.all([first, f.create(input)]);
				expect(results[0].workspace.id).toBe(f.id);
				expect(results[1].workspace.id).toBe(f.id);
				const row = f.row();
				if (!row) throw new Error("Workspace missing");
				expect(row.id).toBe(results[0].workspace.id);
				expect(results[1].workspace.branch).toBe(results[0].workspace.branch);
				expect(launch).toHaveBeenCalledTimes(1);
				expect(f.generator).not.toHaveBeenCalled();
				const host = launch.mock.calls[0]?.[0];
				if (!host) throw new Error("Launch missing");
				host.db
					.insert(terminalSessions)
					.values({ id: "test-agent", originWorkspaceId: f.id })
					.run();
				host.terminalAgentStore.recordEvent({
					terminalId: "test-agent",
					workspaceId: f.id,
					agentId: "claude",
					eventType: "Start",
					occurredAt: Date.now(),
				});
				await until(() => f.generator.mock.calls.length === 1);
				if (kind === "worktree") {
					const branches = execFileSync(
						"git",
						[
							"-C",
							row.worktreePath,
							"branch",
							"--list",
							"--format=%(refname:short)",
						],
						{ encoding: "utf8" },
					)
						.trim()
						.split("\n")
						.filter((branch) => branch && branch !== "main");
					expect(branches).toEqual([row.branch]);
				}
			} finally {
				launch.mockRestore();
				await f.cleanup();
			}
		});
	}

	if (kind === "worktree") {
		for (const invalid of ["archived", "different-project"] as const) {
			test(`worktree: same-ID retry rejects ${invalid} rows`, async () => {
				const f = await fixture();
				try {
					await f.create();
					if (invalid === "archived")
						archiveLocalWorkspace(f.host, f.id, "deleted");
					else
						f.host.db
							.update(workspaces)
							.set({ projectId: null })
							.where(eq(workspaces.id, f.id))
							.run();
					await expect(f.create()).rejects.toThrow(
						"Workspace ID is already in use",
					);
					if (invalid === "archived") unarchiveLocalWorkspace(f.host, f.id);
					else updateLocalWorkspace(f.host, f.id, { projectId: f.projectId });
					expect((await f.create()).workspace.id).toBe(f.id);
				} finally {
					await f.cleanup();
				}
			});
		}
		for (const protection of ["renamed", "switched", "published"] as const) {
			test(`worktree: background naming preserves a ${protection} branch`, async () => {
				const f = await fixture();
				try {
					await f.create();
					const row = f.row();
					if (!row) throw new Error("Workspace missing");
					const git = (...args: string[]) =>
						execFileSync("git", ["-C", row.worktreePath, ...args], {
							encoding: "utf8",
						}).trim();
					await until(() => f.generator.mock.calls.length === 1);
					if (protection === "renamed") git("branch", "-m", "manual-name");
					if (protection === "switched") git("checkout", "-b", "other-branch");
					if (protection === "published")
						git("update-ref", `refs/remotes/origin/${row.branch}`, "HEAD");
					const before = git("branch", "--show-current");
					f.deferred.resolve(title);
					await until(() => f.row()?.name === title.title);
					expect(git("branch", "--show-current")).toBe(before);
					expect(
						git("branch", "--list", `${title.branchName}-${f.id.slice(0, 8)}`),
					).toBe("");
					expect(f.row()?.worktreePath).toBe(row.worktreePath);
				} finally {
					await f.cleanup();
				}
			});
		}
		for (const collisionCount of [1, 2]) {
			test(`worktree: skips ${collisionCount} occupied generated branch names without changing their refs`, async () => {
				const f = await fixture();
				try {
					await f.create();
					const row = f.row();
					if (!row) throw new Error("Workspace missing");
					const git = (...args: string[]) =>
						execFileSync("git", ["-C", row.worktreePath, ...args], {
							encoding: "utf8",
						}).trim();
					await until(() => f.generator.mock.calls.length === 1);
					const candidate = `${title.branchName}-${f.id.slice(0, 8)}`;
					const occupied = Array.from({ length: collisionCount }, (_, i) =>
						i === 0 ? candidate : `${candidate}-${i + 1}`,
					);
					const originalCommit = git("rev-parse", "HEAD");
					for (const branch of occupied) git("branch", branch);
					f.deferred.resolve(title);
					await until(() => f.row()?.name === title.title);
					const expected = `${candidate}-${collisionCount + 1}`;
					expect(git("branch", "--show-current")).toBe(expected);
					expect(f.row()?.branch).toBe(expected);
					expect(f.row()?.worktreePath).toBe(row.worktreePath);
					for (const branch of occupied)
						expect(git("rev-parse", `refs/heads/${branch}`)).toBe(
							originalCommit,
						);
				} finally {
					await f.cleanup();
				}
			});
		}
		test("worktree: generated branch retains the project prefix and unique suffix", async () => {
			const f = await fixture();
			try {
				f.host.db
					.update(projects)
					.set({ branchPrefixMode: "custom", branchPrefixCustom: "team" })
					.where(eq(projects.id, f.projectId))
					.run();
				const result = await f.create();
				expect(result.workspace.branch).toMatch(
					new RegExp(`^team/[a-z]+-[a-z]+-${f.id.slice(0, 8)}$`),
				);
				f.deferred.resolve(title);
				await until(() => f.row()?.name === title.title);
				expect(f.row()?.branch).toBe(
					`team/${title.branchName}-${f.id.slice(0, 8)}`,
				);
			} finally {
				await f.cleanup();
			}
		});
		test("worktree: configured prefix and explicit branches survive title generation", async () => {
			const f = await fixture();
			try {
				f.host.db
					.update(projects)
					.set({ branchPrefixMode: "custom", branchPrefixCustom: "team" })
					.where(eq(projects.id, f.projectId))
					.run();
				const result = await f.create({ branch: "typed-branch" });
				expect(result.workspace.branch).toBe("team/typed-branch");
				f.deferred.resolve(title);
				await until(() => f.row()?.name === title.title);
				expect(f.row()?.branch).toBe("team/typed-branch");
			} finally {
				await f.cleanup();
			}
		});
	}
}

test("host disposal prevents late naming from reading the closed database", async () => {
	const scenario = await createBasicScenario();
	const deferred =
		Promise.withResolvers<naming.GeneratedWorkspaceNames | null>();
	const generator = spyOn(
		naming,
		"generateWorkspaceNamesFromPrompt",
	).mockReturnValue(deferred.promise);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	let disposed = false;
	try {
		const workspace = getLocalWorkspace(scenario.host.db, scenario.workspaceId);
		if (!workspace) throw new Error("Workspace missing");
		naming.generateWorkspaceTitleInBackground({
			ctx: scenario.host,
			workspace,
			prompt: "Fix login",
		});
		await until(() => generator.mock.calls.length === 1);
		await scenario.dispose();
		disposed = true;
		expect(generator.mock.calls[0]?.[3]?.aborted).toBe(true);
		deferred.resolve(title);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(
			warn.mock.calls.some(
				(call) => call[0] === "[workspace-title] generation failed",
			),
		).toBe(false);
	} finally {
		deferred.resolve(null);
		if (!disposed) await scenario.dispose();
		generator.mockRestore();
		warn.mockRestore();
	}
});
