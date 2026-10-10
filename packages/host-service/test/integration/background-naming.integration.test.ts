import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { projects, terminalSessions, workspaces } from "../../src/db/schema";
import { PullRequestRuntimeManager } from "../../src/runtime/pull-requests/pull-requests";
import * as agents from "../../src/trpc/router/agents";
import * as naming from "../../src/trpc/router/workspace-creation/utils/ai-workspace-names";
import {
	archiveLocalWorkspace,
	deleteLocalWorkspace,
	getLocalWorkspace,
	unarchiveLocalWorkspace,
	updateLocalWorkspace,
} from "../../src/workspaces/local-workspace-store";
import {
	getWorkspaceNamingState,
	setWorkspaceNamingState,
} from "../../src/workspaces/workspace-naming-state";
import { commitWorkspaceTitleJob } from "../../src/workspaces/workspace-title-jobs";
import { createBasicScenario } from "../helpers/scenarios";

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

const uniqueSlug = /^[a-z]+-[a-z]+-[0-9a-f]{8}(?:-\d+)?$/;

for (const kind of ["session", "worktree"] as const) {
	const placeholder = kind === "session" ? "New session" : "New workspace";
	async function fixture() {
		const scenario = await createBasicScenario();
		const id = crypto.randomUUID();
		const deferred =
			Promise.withResolvers<naming.GeneratedWorkspaceNames | null>();
		const generator = spyOn(
			naming,
			"generateWorkspaceNamesFromPrompt",
		).mockReturnValue(deferred.promise);
		const headless = spyOn(naming, "canNameWithAgent").mockReturnValue(true);
		const row = () => getLocalWorkspace(scenario.host.db, id);
		const namingState = () => getWorkspaceNamingState(scenario.host.db, id);
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
		const hook = (eventType: string, preview?: string) =>
			scenario.host.unauthenticatedTrpc.notifications.hook.mutate({
				terminalId: "test-agent",
				eventType,
				agent: { agentId: "claude" },
				...(preview ? { preview } : {}),
			});
		return {
			...scenario,
			id,
			deferred,
			generator,
			headless,
			row,
			namingState,
			create,
			hook,
			cleanup: async () => {
				const path = row()?.worktreePath;
				deferred.resolve(null);
				await new Promise((resolve) => setTimeout(resolve, 0));
				generator.mockRestore();
				headless.mockRestore();
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
			expect(result.workspace.name).toBe(placeholder);
			await until(() => f.generator.mock.calls.length === 1);
			const initial = f.row();
			if (!initial) throw new Error("Workspace row missing");
			const folder = basename(initial.worktreePath);
			expect(folder).toMatch(uniqueSlug);
			expect(folder).not.toContain("https");
			expect(initial.branch).toBe(kind === "session" ? "main" : folder);
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
			expect(result.workspace.name).toBe(placeholder);
			expect(f.row()?.name).toBe(placeholder);
			const folder = basename(f.row()?.worktreePath ?? "");
			expect(folder).toMatch(uniqueSlug);
			expect(result.workspace.branch).toBe(
				kind === "session" ? "main" : folder,
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

	test(`${kind}: unusable AI output falls back to a prompt title and keeps the branch`, async () => {
		const f = await fixture();
		const failed = spyOn(f.host.eventBus, "broadcastWorkspaceNamingFailed");
		try {
			const result = await f.create({
				namingPrompt: "What does git rebase do?",
			});
			await until(() => f.generator.mock.calls.length === 1);
			f.deferred.resolve(null);
			await until(() => f.row()?.name !== result.workspace.name);
			expect(f.row()?.name).toBe("What does git rebase do");
			expect(f.row()?.branch).toBe(result.workspace.branch);
			expect(failed).not.toHaveBeenCalled();
		} finally {
			await f.cleanup();
		}
	});

	async function withAgent(
		f: Awaited<ReturnType<typeof fixture>>,
		firstResult: naming.GeneratedWorkspaceNames | null | "pending",
		run: () => Promise<void>,
	) {
		const launch = spyOn(agents, "runAgentInWorkspace").mockResolvedValue({
			kind: "terminal",
			sessionId: "test-agent",
			label: "Test agent",
		});
		try {
			if (firstResult !== "pending")
				f.generator.mockResolvedValueOnce(firstResult);
			await f.create({
				agents: [{ agent: "test-agent", prompt: "Fix login" }],
			});
			f.host.db
				.insert(terminalSessions)
				.values({ id: "test-agent", originWorkspaceId: f.id })
				.run();
			await run();
		} finally {
			launch.mockRestore();
			await f.cleanup();
		}
	}
	const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

	test(`${kind}: naming starts at creation; a failed attempt keeps a prompt title and retries with the agent's reply on the next Stop`, async () => {
		const f = await fixture();
		await withAgent(f, null, async () => {
			await until(() => f.row()?.name === "Fix login");
			expect(f.namingState()?.attempts).toBe(1);
			await f.hook("Start");
			await settle();
			expect(f.generator).toHaveBeenCalledTimes(1);
			f.generator.mockResolvedValueOnce(title);
			await f.hook("Stop", "I traced the login failure to an expired token.");
			await until(() => f.row()?.name === title.title);
			expect(f.generator.mock.calls[1]?.[5]?.agentReply).toBe(
				"I traced the login failure to an expired token.",
			);
			expect(f.namingState()).toBeUndefined();
			await f.hook("Stop", "done");
			await settle();
			expect(f.generator).toHaveBeenCalledTimes(2);
		});
	});

	test(`${kind}: a Stop during the first attempt retries right after it with that reply`, async () => {
		const f = await fixture();
		await withAgent(f, "pending", async () => {
			await until(() => f.generator.mock.calls.length === 1);
			f.generator.mockResolvedValueOnce(title);
			await f.hook("Stop", "Answered the question about login.");
			f.deferred.resolve(null);
			await until(() => f.row()?.name === title.title);
			expect(f.generator).toHaveBeenCalledTimes(2);
			expect(f.generator.mock.calls[1]?.[5]?.agentReply).toBe(
				"Answered the question about login.",
			);
		});
	});

	test(`${kind}: naming gives up after three failed attempts and says so once`, async () => {
		const f = await fixture();
		const failed = spyOn(f.host.eventBus, "broadcastWorkspaceNamingFailed");
		await withAgent(f, null, async () => {
			f.generator.mockResolvedValue(null);
			await until(() => f.namingState()?.attempts === 1);
			await f.hook("Stop", "reply");
			await until(() => f.namingState()?.attempts === 2);
			await f.hook("Stop", "reply");
			await until(() => f.namingState() === undefined);
			expect(f.generator).toHaveBeenCalledTimes(3);
			await f.hook("Stop", "reply");
			await settle();
			expect(f.generator).toHaveBeenCalledTimes(3);
			expect(f.row()?.name).toBe("Fix login");
			expect(failed).toHaveBeenCalledTimes(1);
			expect(failed.mock.calls[0]?.[0]?.name).toBe("Fix login");
		});
		failed.mockRestore();
	});

	test(`${kind}: an agent with no headless mode keeps the prompt title with no retries or failure notice`, async () => {
		const f = await fixture();
		const failed = spyOn(f.host.eventBus, "broadcastWorkspaceNamingFailed");
		f.headless.mockReturnValue(false);
		await withAgent(f, null, async () => {
			await until(() => f.row()?.name === "Fix login");
			expect(f.namingState()).toBeUndefined();
			await f.hook("Stop", "reply");
			await settle();
			expect(f.generator).toHaveBeenCalledTimes(1);
			expect(f.generator.mock.calls[0]?.[1]).toBeUndefined();
			expect(failed).not.toHaveBeenCalled();
		});
		failed.mockRestore();
	});

	test(`${kind}: a title edit waits for an in-flight branch-rename commit and wins`, async () => {
		const f = await fixture();
		await withAgent(f, "pending", async () => {
			await until(() => f.generator.mock.calls.length === 1);
			const gate = Promise.withResolvers<void>();
			const committing = Promise.withResolvers<void>();
			const commit = commitWorkspaceTitleJob(f.host.db, f.id, async () => {
				committing.resolve();
				await gate.promise;
				updateLocalWorkspace(f.host, f.id, {
					name: "AI title",
					autoNaming: null,
				});
			});
			await committing.promise;
			const edit = f.host.trpc.workspace.update.mutate({
				id: f.id,
				name: "Mine",
			});
			await settle();
			gate.resolve();
			await Promise.all([commit, edit]);
			expect(f.row()?.name).toBe("Mine");
		});
	});

	test(`${kind}: a rename between attempts ends automatic naming`, async () => {
		const f = await fixture();
		await withAgent(f, null, async () => {
			await until(() => f.row()?.name === "Fix login");
			await f.host.trpc.workspace.update.mutate({ id: f.id, name: "Mine" });
			await f.hook("Stop", "reply");
			await settle();
			expect(f.generator).toHaveBeenCalledTimes(1);
			expect(f.row()?.name).toBe("Mine");
			expect(f.namingState()).toBeUndefined();
		});
	});

	test(`${kind}: a first attempt that never ran runs on the agent's first Start`, async () => {
		const f = await fixture();
		await withAgent(f, null, async () => {
			await until(() => f.namingState()?.attempts === 1);
			const current = f.namingState();
			if (!current) throw new Error("Naming state missing");
			setWorkspaceNamingState(f.host.db, f.id, { ...current, attempts: 0 });
			f.generator.mockResolvedValueOnce(title);
			await f.hook("Start");
			await until(() => f.row()?.name === title.title);
			expect(f.generator).toHaveBeenCalledTimes(2);
		});
	});

	test(`${kind}: a vague prompt gets its guessed title now and is refined with the agent's reply`, async () => {
		const f = await fixture();
		const guess = {
			title: "Getting started",
			branchName: "getting-started",
			vague: true,
		};
		await withAgent(f, guess, async () => {
			await until(() => f.row()?.name === guess.title);
			expect(f.namingState()?.prompt).toBe("Fix login");
			expect(f.namingState()?.attempts).toBe(1);
			if (kind === "worktree")
				expect(f.namingState()?.branch).toBe(f.row()?.branch ?? null);
			f.generator.mockResolvedValueOnce(title);
			await f.hook("Stop", "Login fails because the session token expired.");
			await until(() => f.row()?.name === title.title);
			expect(f.generator.mock.calls[1]?.[5]?.agentReply).toBe(
				"Login fails because the session token expired.",
			);
			expect(f.namingState()).toBeUndefined();
			if (kind === "worktree")
				expect(
					f.row()?.branch.endsWith(`${title.branchName}-${f.id.slice(0, 8)}`),
				).toBe(true);
		});
	});

	for (const resolveBeforeLaunchFinishes of [false, true]) {
		test(`${kind}: naming starts at creation without blocking dispatch; response includes names ready during startup (${resolveBeforeLaunchFinishes})`, async () => {
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
				await until(() => f.generator.mock.calls.length === 1);
				const host = launch.mock.calls[0]?.[0];
				if (!host) throw new Error("Launch missing");
				host.db
					.insert(terminalSessions)
					.values({ id: "test-agent", originWorkspaceId: f.id })
					.run();
				await f.hook("Attached");
				await f.hook("Start");
				await new Promise((resolve) => setTimeout(resolve, 20));
				expect(f.generator).toHaveBeenCalledTimes(1);
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
				await until(() => f.generator.mock.calls.length === 1);
				const host = launch.mock.calls[0]?.[0];
				if (!host) throw new Error("Launch missing");
				host.db
					.insert(terminalSessions)
					.values({ id: "test-agent", originWorkspaceId: f.id })
					.run();
				await f.hook("Start");
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
		test("worktree: a same-ID create that names a different branch is rejected, not treated as a retry", async () => {
			const f = await fixture();
			try {
				await f.create({ branch: "explicit-a" });
				await expect(f.create({ branch: "explicit-b" })).rejects.toThrow(
					"Workspace ID is already in use",
				);
				expect((await f.create({ branch: "explicit-a" })).workspace.id).toBe(
					f.id,
				);
			} finally {
				await f.cleanup();
			}
		});
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
		setWorkspaceNamingState(scenario.host.db, scenario.workspaceId, {
			prompt: "Fix login",
			attempts: 0,
			branch: null,
			agent: "claude",
		});
		scenario.host.db
			.insert(terminalSessions)
			.values({ id: "test-agent", originWorkspaceId: scenario.workspaceId })
			.run();
		await scenario.host.unauthenticatedTrpc.notifications.hook.mutate({
			terminalId: "test-agent",
			eventType: "Start",
			agent: { agentId: "claude" },
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
