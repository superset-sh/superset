import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createBasicScenario } from "../../../../../test/helpers/scenarios";
import { projects } from "../../../../db/schema";
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
	branchName: "ai-must-not-change-this",
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

	test(`${kind}: creation returns before naming and the branch stays fixed`, async () => {
		const f = await fixture();
		try {
			const result = await f.create();
			expect(result.workspace.name).toBe("Fix login");
			await until(() => f.generator.mock.calls.length === 1);
			const initial = f.row();
			if (!initial) throw new Error("Workspace row missing");
			const branch = initial.branch;
			expect(branch).toBe(
				kind === "session" ? "main" : `fix-login-${f.id.slice(0, 8)}`,
			);
			f.deferred.resolve(title);
			await until(() => f.row()?.name === title.title);
			expect(f.row()?.branch).toBe(branch);
			expect(
				execFileSync(
					"git",
					["-C", initial.worktreePath, "branch", "--show-current"],
					{ encoding: "utf8" },
				).trim(),
			).toBe(branch);
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
				await f.create();
				await until(() => f.generator.mock.calls.length === 1);
				if (edit === "manual" || edit === "away-and-back") {
					updateLocalWorkspace(f.host, f.id, { name: "My title" });
					if (edit === "away-and-back")
						updateLocalWorkspace(f.host, f.id, { name: "Fix login" });
				} else {
					archiveLocalWorkspace(f.host, f.id, "deleted");
					if (edit === "archive-and-restore")
						unarchiveLocalWorkspace(f.host, f.id);
				}
				f.deferred.resolve(title);
				await new Promise((resolve) => setTimeout(resolve, 20));
				expect(f.row()?.name).toBe(
					edit === "manual" ? "My title" : "Fix login",
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
			expect(f.row()?.name).toBe("Fix login");
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
				if (resolveBeforeLaunchFinishes) {
					f.deferred.resolve(title);
					await until(() => f.row()?.name === title.title);
				}
				release.resolve();
				const result = await creation;
				expect(result.agents[0]?.ok).toBe(true);
				expect(result.workspace.name).toBe(
					resolveBeforeLaunchFinishes ? title.title : "Fix login",
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

	if (kind === "worktree") {
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
