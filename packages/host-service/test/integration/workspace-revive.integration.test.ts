import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import * as teardown from "../../src/runtime/teardown";
import { cleanupGitOps } from "../../src/trpc/router/workspace-cleanup/git-ops";
import { __testDestroysInFlight } from "../../src/trpc/router/workspace-cleanup/workspace-cleanup";
import * as setupTerminal from "../../src/trpc/router/workspace-creation/shared/setup-terminal";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspaceCleanup.revive integration", () => {
	let scenario: FeatureWorktreeScenario;

	beforeEach(async () => {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
	});

	afterEach(async () => {
		await scenario.dispose();
	});

	function readRow(workspaceId: string) {
		return scenario.host.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
	}

	async function destroyFeature(deleteBranch = false): Promise<void> {
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch,
			archive: !deleteBranch,
		});
		expect(existsSync(scenario.worktreePath)).toBe(false);
		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.archivedAt).not.toBeNull();
		expect(row?.archiveReason).toBe(deleteBranch ? "deleted" : "archived");
	}

	async function expectCode(
		promise: Promise<unknown>,
		code: string,
	): Promise<TRPCClientError<never>> {
		let caught: unknown;
		try {
			await promise;
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(TRPCClientError);
		const error = caught as TRPCClientError<never>;
		expect(error.data?.code).toBe(code);
		return error;
	}

	test("recreates the worktree at the tombstone's own path and revives the row", async () => {
		await destroyFeature();
		const events: string[] = [];
		const stop = scenario.host.eventBus.onWorkspaceChanged((event) => {
			events.push(event.eventType);
		});

		const result = await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		stop();

		expect(result.workspace.id).toBe(scenario.featureWorkspaceId);
		expect(existsSync(scenario.worktreePath)).toBe(true);
		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.archivedAt).toBeNull();
		expect(row?.archiveReason).toBeNull();
		expect(row?.branch).toBe(scenario.branch);

		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(`worktree ${scenario.worktreePath}`);
		expect(worktrees).toContain(`branch refs/heads/${scenario.branch}`);
		expect(events).toContain("created");
	});

	test("archive endpoint forces archive semantics and preserves the branch for revival", async () => {
		const input = {
			workspaceId: scenario.featureWorkspaceId,
			archive: false,
			deleteBranch: true,
		};
		const result =
			await scenario.host.trpc.workspaceCleanup.archive.mutate(input);
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(result.branchDeleted).toBe(false);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
			"archived",
		);
		expect(existsSync(scenario.worktreePath)).toBe(false);
		expect(
			await scenario.repo.git.raw(["branch", "--list", scenario.branch]),
		).toContain(scenario.branch);
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
		expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
	});

	test("archive endpoint defaults to preflight and blocking teardown", async () => {
		writeFileSync(join(scenario.worktreePath, "archive-dirty.txt"), "dirty");
		const hook = spyOn(teardown, "runTeardown").mockResolvedValue({
			status: "failed",
			exitCode: 1,
			signal: null,
			timedOut: false,
			outputTail: "teardown failed",
		});
		try {
			await expectCode(
				scenario.host.trpc.workspaceCleanup.archive.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			expect(hook).not.toHaveBeenCalled();
			await expectCode(
				scenario.host.trpc.workspaceCleanup.archive.mutate({
					workspaceId: scenario.featureWorkspaceId,
					force: true,
				}),
				"PRECONDITION_FAILED",
			);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
			expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
			await scenario.host.trpc.workspaceCleanup.archive.mutate({
				workspaceId: scenario.featureWorkspaceId,
				force: true,
				skipTeardown: true,
			});
			expect(hook).toHaveBeenCalledTimes(1);
			expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
				"archived",
			);
		} finally {
			hook.mockRestore();
		}
	});

	test("rejects restore and destroy while the workspace lifecycle guard is held", async () => {
		await destroyFeature();
		__testDestroysInFlight.add(scenario.featureWorkspaceId);
		try {
			await expectCode(
				scenario.host.trpc.workspaceCleanup.revive.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			await expectCode(
				scenario.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
				"archived",
			);
			expect(existsSync(scenario.worktreePath)).toBe(false);
		} finally {
			__testDestroysInFlight.delete(scenario.featureWorkspaceId);
		}
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(existsSync(scenario.worktreePath)).toBe(true);
	});

	test("rejects archiving a session before changing its row or removing its directory", async () => {
		const workspaceId = scenario.featureWorkspaceId;
		scenario.host.db
			.update(workspaces)
			.set({ type: "session", projectId: null, branch: "main" })
			.where(eq(workspaces.id, workspaceId))
			.run();
		const session = readRow(workspaceId);
		await expectCode(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId,
				archive: true,
				force: true,
			}),
			"BAD_REQUEST",
		);
		expect(readRow(workspaceId)).toEqual(session);
		expect(readRow(workspaceId)?.archivedAt).toBeNull();
		expect(readRow(workspaceId)?.archiveReason).toBeNull();
		expect(existsSync(scenario.worktreePath)).toBe(true);
		expect(existsSync(`${scenario.worktreePath}/.git`)).toBe(true);
	});

	for (const force of [false, true]) {
		for (const branch of ["release", "heads/release"]) {
			test(`archives and revives the exact ${branch} branch (force=${force})`, async () => {
				const workspaceId = scenario.featureWorkspaceId;
				await scenario.repo.git.raw(["branch", "-m", scenario.branch, branch]);
				if (branch === "release") {
					await scenario.repo.git.raw(["tag", branch, `refs/heads/${branch}`]);
				}
				scenario.host.db
					.update(workspaces)
					.set({ branch })
					.where(eq(workspaces.id, workspaceId))
					.run();
				const identityInput = {
					worktreePath: scenario.worktreePath,
					gitEnv: {},
				};
				const before = await cleanupGitOps.readArchiveIdentity(identityInput);
				expect(before.headRef).toBe(`refs/heads/${branch}`);
				expect(before.headSha).toBeTruthy();

				await scenario.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId,
					archive: true,
					force,
				});
				expect(existsSync(scenario.worktreePath)).toBe(false);
				expect(readRow(workspaceId)?.archiveReason).toBe("archived");
				expect(readRow(workspaceId)?.branch).toBe(branch);

				await scenario.host.trpc.workspaceCleanup.revive.mutate({
					workspaceId,
				});
				expect(readRow(workspaceId)?.archivedAt).toBeNull();
				expect(readRow(workspaceId)?.archiveReason).toBeNull();
				expect(readRow(workspaceId)?.branch).toBe(branch);
				expect(await cleanupGitOps.readArchiveIdentity(identityInput)).toEqual(
					before,
				);
			});
		}

		test(`rejects archive with branch deletion before tombstoning (force=${force})`, async () => {
			const before = readRow(scenario.featureWorkspaceId);
			await expectCode(
				scenario.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: scenario.featureWorkspaceId,
					archive: true,
					deleteBranch: true,
					force,
				}),
				"BAD_REQUEST",
			);
			expect(readRow(scenario.featureWorkspaceId)).toEqual(before);
			expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
			expect(
				await scenario.repo.git.raw(["branch", "--list", scenario.branch]),
			).toContain(scenario.branch);
		});

		for (const identity of ["detached", "mismatched", "unreadable"] as const) {
			for (const duringTeardown of [false, true]) {
				test(`rejects ${identity} archive identity (force=${force}, duringTeardown=${duringTeardown})`, async () => {
					const workspaceId = scenario.featureWorkspaceId;
					const changeIdentity = async () => {
						if (identity === "detached") {
							await scenario.repo.git.raw([
								"-C",
								scenario.worktreePath,
								"checkout",
								"--detach",
							]);
							await scenario.repo.git.raw([
								"-C",
								scenario.worktreePath,
								"commit",
								"--allow-empty",
								"-m",
								"Detached archive commit",
							]);
						} else if (identity === "mismatched") {
							await scenario.repo.git.raw([
								"-C",
								scenario.worktreePath,
								"checkout",
								"-b",
								"archive-other-branch",
							]);
						} else {
							await scenario.repo.git.raw([
								"update-ref",
								"-d",
								`refs/heads/${scenario.branch}`,
							]);
						}
					};
					if (!duringTeardown) await changeIdentity();
					const remove = spyOn(cleanupGitOps, "removeWorktree");
					const hook = spyOn(teardown, "runTeardown").mockImplementation(
						async () => {
							expect(readRow(workspaceId)?.archiveReason).toBe("archived");
							await changeIdentity();
							return { status: "skipped" };
						},
					);
					try {
						const error = await expectCode(
							scenario.host.trpc.workspaceCleanup.destroy.mutate({
								workspaceId,
								archive: true,
								force,
							}),
							"CONFLICT",
						);
						expect(error.message).toContain(
							"HEAD must be readable and attached",
						);
						expect(hook).toHaveBeenCalledTimes(duringTeardown ? 1 : 0);
						expect(remove).not.toHaveBeenCalled();
						expect(readRow(workspaceId)?.archivedAt).toBeNull();
						expect(readRow(workspaceId)?.archiveReason).toBeNull();
						expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
						expect(__testDestroysInFlight.has(workspaceId)).toBe(false);
						if (identity !== "unreadable") {
							expect(
								await scenario.repo.git.raw([
									"-C",
									scenario.worktreePath,
									"rev-parse",
									"--verify",
									"HEAD",
								]),
							).not.toBe("");
							expect(
								await scenario.repo.git.raw([
									"branch",
									"--list",
									scenario.branch,
								]),
							).toContain(scenario.branch);
						}
					} finally {
						hook.mockRestore();
						remove.mockRestore();
					}
				});
			}
		}
	}

	test("refuses a workspace that is not archived", async () => {
		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"NOT_FOUND",
		);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
	});

	test("refuses a deleted workspace even once its branch is back", async () => {
		await destroyFeature(true);
		const error = await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
		expect(error.message).toContain("deleted");

		await scenario.repo.git.raw(["branch", scenario.branch, "HEAD"]);
		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe("deleted");
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	test("deleting an archived workspace restamps it as deleted and can drop the branch", async () => {
		await destroyFeature();

		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});

		const row = readRow(scenario.featureWorkspaceId);
		expect(row?.archiveReason).toBe("deleted");
		expect(row?.archivedAt).not.toBeNull();
		const listed = await scenario.repo.git.raw([
			"branch",
			"--list",
			scenario.branch,
		]);
		expect(listed.trim()).toBe("");
		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
	});

	for (const force of [false, true]) {
		test(`refuses deleting an archive adopted at an equivalent path (force=${force})`, async () => {
			await destroyFeature();
			await scenario.repo.git.raw([
				"worktree",
				"add",
				scenario.worktreePath,
				scenario.branch,
			]);
			const alias = join(scenario.repo.repoPath, "adopted-alias");
			symlinkSync(dirname(scenario.worktreePath), alias, "junction");
			const adopted = await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "adopted",
				branch: scenario.branch,
			});
			const ownerId = adopted?.workspace?.id;
			if (!ownerId) throw new Error("Expected an adopted workspace");
			expect(ownerId).not.toBe(scenario.featureWorkspaceId);
			scenario.host.db
				.update(workspaces)
				.set({
					worktreePath: `${alias}/./${basename(scenario.worktreePath)}/`,
				})
				.where(eq(workspaces.id, ownerId))
				.run();
			const archived = readRow(scenario.featureWorkspaceId);
			const remove = spyOn(cleanupGitOps, "removeWorktree");
			const teardownCall = spyOn(teardown, "runTeardown");
			try {
				const error = await expectCode(
					scenario.host.trpc.workspaceCleanup.destroy.mutate({
						workspaceId: scenario.featureWorkspaceId,
						deleteBranch: true,
						force,
					}),
					"CONFLICT",
				);
				expect(error.message).toContain("owned by another live workspace");
				expect(remove).not.toHaveBeenCalled();
				expect(teardownCall).not.toHaveBeenCalled();
				expect(readRow(scenario.featureWorkspaceId)).toEqual(archived);
				expect(readRow(ownerId)?.archivedAt).toBeNull();
				expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
				expect(
					await scenario.repo.git.raw(["branch", "--list", scenario.branch]),
				).toContain(scenario.branch);
			} finally {
				remove.mockRestore();
				teardownCall.mockRestore();
			}
		});
	}

	test("preserves a live owner's branch at a different path when deleting an archive", async () => {
		await destroyFeature();
		const owner = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: `${scenario.worktreePath}-other`,
			branch: scenario.branch,
		});
		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
		expect(result.success).toBe(true);
		expect(result.branchDeleted).toBe(false);
		expect(result.warnings.join(" ")).toContain(
			"owned by another live workspace",
		);
		expect(readRow(owner.id)?.archivedAt).toBeNull();
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe("deleted");
		expect(
			await scenario.repo.git.raw(["branch", "--list", scenario.branch]),
		).toContain(scenario.branch);
	});

	for (const boundary of [
		"readWorktreeState",
		"runTeardown",
		"resolveGitEnv",
		"removeWorktree",
	] as const) {
		test(`protects a path acquired during awaited ${boundary}`, async () => {
			await destroyFeature();
			await scenario.repo.git.raw([
				"worktree",
				"add",
				scenario.worktreePath,
				scenario.branch,
			]);
			const archived = readRow(scenario.featureWorkspaceId);
			let ownerId = "";
			const claim = () => {
				ownerId = seedWorkspace(scenario.host, {
					projectId: scenario.projectId,
					worktreePath: scenario.worktreePath,
					branch: scenario.branch,
				}).id;
			};
			const originalResolve = cleanupGitOps.resolveGitEnv;
			const originalRead = cleanupGitOps.readWorktreeState;
			const hook =
				boundary === "runTeardown"
					? spyOn(teardown, "runTeardown").mockImplementation(async () => {
							claim();
							return { status: "skipped" };
						})
					: boundary === "resolveGitEnv"
						? spyOn(cleanupGitOps, "resolveGitEnv").mockImplementation(
								async (...args) => {
									const result = await originalResolve(...args);
									claim();
									return result;
								},
							)
						: boundary === "readWorktreeState"
							? spyOn(cleanupGitOps, "readWorktreeState").mockImplementation(
									async (...args) => {
										const result = await originalRead(...args);
										claim();
										return result;
									},
								)
							: spyOn(cleanupGitOps, "removeWorktree").mockImplementation(
									async () => {
										claim();
										return { stillRegistered: false };
									},
								);
			try {
				const destroyStartedAt = Date.now();
				await expectCode(
					scenario.host.trpc.workspaceCleanup.destroy.mutate({
						workspaceId: scenario.featureWorkspaceId,
						deleteBranch: true,
						force: boundary !== "readWorktreeState",
						skipTeardown:
							boundary !== "readWorktreeState" && boundary !== "runTeardown",
					}),
					"CONFLICT",
				);
				expect(ownerId).not.toBe("");
				expect(readRow(ownerId)?.archivedAt).toBeNull();
				const restored = readRow(scenario.featureWorkspaceId);
				expect(restored).toEqual({
					...archived,
					updatedAt: expect.any(Number),
				});
				expect(restored?.updatedAt).toBeGreaterThanOrEqual(destroyStartedAt);
				expect(restored?.updatedAt).toBeLessThanOrEqual(Date.now());
				expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
			} finally {
				hook.mockRestore();
			}
		});
	}

	for (const { adopt, outcome, code, message } of [
		{
			adopt: true,
			outcome: "skipped",
			code: "CONFLICT",
			message:
				"Cannot delete workspace: its path is owned by another live workspace",
		},
		...[true, false].flatMap((adopt) => [
			{
				adopt,
				outcome: "failed",
				code: "PRECONDITION_FAILED",
				message: "Teardown script failed",
			},
			{
				adopt,
				outcome: "throw",
				code: "INTERNAL_SERVER_ERROR",
				message: "Unexpected teardown failure",
			},
		]),
	]) {
		test(`rolls back live workspace cleanup safely after teardown ${outcome} (adopt=${adopt})`, async () => {
			const workspaceId = scenario.featureWorkspaceId;
			expect(readRow(workspaceId)?.archivedAt).toBeNull();
			let tombstone: ReturnType<typeof readRow>;
			let owner: ReturnType<typeof readRow>;
			const remove = spyOn(cleanupGitOps, "removeWorktree");
			const hook = spyOn(teardown, "runTeardown").mockImplementation(
				async () => {
					tombstone = readRow(workspaceId);
					expect(tombstone?.archivedAt).not.toBeNull();
					expect(tombstone?.archiveReason).toBe("archived");
					if (adopt) {
						const adopted = await scenario.host.trpc.workspaces.create.mutate({
							projectId: scenario.projectId,
							name: "adopted during teardown",
							branch: scenario.branch,
						});
						const ownerId = adopted?.workspace?.id;
						if (!ownerId) throw new Error("Expected an adopted workspace");
						expect(ownerId).not.toBe(workspaceId);
						const alias = join(scenario.repo.repoPath, "cleanup-owner-alias");
						symlinkSync(dirname(scenario.worktreePath), alias, "junction");
						scenario.host.db
							.update(workspaces)
							.set({
								worktreePath: `${alias}/./${basename(scenario.worktreePath)}/`,
							})
							.where(eq(workspaces.id, ownerId))
							.run();
						owner = readRow(ownerId);
					}
					if (outcome === "throw") throw new Error(message);
					return outcome === "failed"
						? {
								status: "failed",
								exitCode: 1,
								signal: null,
								timedOut: false,
								outputTail: "teardown failed",
							}
						: { status: "skipped" };
				},
			);
			try {
				const error = await expectCode(
					scenario.host.trpc.workspaceCleanup.destroy.mutate({
						workspaceId,
						archive: true,
						deleteBranch: false,
						force: true,
					}),
					code,
				);
				expect(error.message).toBe(message);
				expect(hook).toHaveBeenCalledTimes(1);
				expect(remove).not.toHaveBeenCalled();
				if (adopt) {
					expect(readRow(workspaceId)).toEqual(tombstone);
					if (!owner) throw new Error("Expected a live path owner");
					expect(owner.archivedAt).toBeNull();
					expect(readRow(owner.id)).toEqual(owner);
				} else {
					expect(readRow(workspaceId)?.archivedAt).toBeNull();
					expect(readRow(workspaceId)?.archiveReason).toBeNull();
				}
				expect(__testDestroysInFlight.has(workspaceId)).toBe(false);
				expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
				expect(
					await scenario.repo.git.raw(["branch", "--list", scenario.branch]),
				).toContain(scenario.branch);
			} finally {
				hook.mockRestore();
				remove.mockRestore();
			}
		});
	}

	test("preserves a branch acquired while worktree removal is awaited", async () => {
		await destroyFeature();
		const originalRemove = cleanupGitOps.removeWorktree;
		const remove = spyOn(cleanupGitOps, "removeWorktree").mockImplementation(
			async (...args) => {
				const result = await originalRemove(...args);
				seedWorkspace(scenario.host, {
					projectId: scenario.projectId,
					worktreePath: `${scenario.worktreePath}-other`,
					branch: scenario.branch,
				});
				return result;
			},
		);
		try {
			const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: scenario.featureWorkspaceId,
				deleteBranch: true,
			});
			expect(result.branchDeleted).toBe(false);
			expect(
				await scenario.repo.git.raw(["branch", "--list", scenario.branch]),
			).toContain(scenario.branch);
		} finally {
			remove.mockRestore();
		}
	});

	test("refuses when the branch no longer exists", async () => {
		await destroyFeature();
		await scenario.repo.git.raw(["branch", "-D", scenario.branch]);

		const error = await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);
		expect(error.message).toContain(scenario.branch);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
			"archived",
		);
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	for (const exactRemoteExists of [false, true]) {
		test(`preserves archived origin/feature identity after local deletion (exactRemoteExists=${exactRemoteExists})`, async () => {
			const branch = "origin/feature";
			const workspaceId = scenario.featureWorkspaceId;
			await scenario.repo.git.raw(["branch", "-m", scenario.branch, branch]);
			scenario.host.db
				.update(workspaces)
				.set({ branch })
				.where(eq(workspaces.id, workspaceId))
				.run();
			await scenario.repo.git.raw([
				"remote",
				"add",
				"origin",
				scenario.repo.repoPath,
			]);
			const identityInput = {
				worktreePath: scenario.worktreePath,
				gitEnv: {},
			};
			const before = await cleanupGitOps.readArchiveIdentity(identityInput);
			expect(before.headRef).toBe("refs/heads/origin/feature");
			expect(before.headSha).toBeTruthy();
			await scenario.repo.git.raw([
				"update-ref",
				"refs/remotes/origin/feature",
				`refs/heads/${branch}`,
			]);
			if (exactRemoteExists) {
				await scenario.repo.git.raw([
					"update-ref",
					"refs/remotes/origin/origin/feature",
					`refs/heads/${branch}`,
				]);
			}
			await destroyFeature();
			await scenario.repo.git.raw(["branch", "-D", branch]);
			const archived = readRow(workspaceId);
			const revive = scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId,
			});
			if (exactRemoteExists) {
				const result = await revive;
				expect(result.workspace.branch).toBe(branch);
				expect(readRow(workspaceId)?.branch).toBe(branch);
				expect(readRow(workspaceId)?.archivedAt).toBeNull();
				expect(readRow(workspaceId)?.archiveReason).toBeNull();
				expect(await cleanupGitOps.readArchiveIdentity(identityInput)).toEqual(
					before,
				);
				expect(
					(
						await scenario.repo.git.raw([
							"config",
							"--get",
							`branch.${branch}.merge`,
						])
					).trim(),
				).toBe("refs/heads/origin/feature");
			} else {
				const error = await expectCode(revive, "PRECONDITION_FAILED");
				expect(error.message).toContain(branch);
				expect(readRow(workspaceId)).toEqual(archived);
				expect(existsSync(scenario.worktreePath)).toBe(false);
			}
			const localRefs = (
				await scenario.repo.git.raw([
					"for-each-ref",
					"--format=%(refname)",
					"refs/heads/",
				])
			).split("\n");
			expect(localRefs).not.toContain("refs/heads/feature");
			expect(localRefs.includes("refs/heads/origin/feature")).toBe(
				exactRemoteExists,
			);
		});
	}

	test("refuses when a live workspace already owns the branch", async () => {
		await destroyFeature();
		seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: `${scenario.worktreePath}-again`,
			branch: scenario.branch,
		});

		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"CONFLICT",
		);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).not.toBeNull();
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	test("refuses revival when another workspace acquires the recreated worktree during Git setup", async () => {
		await destroyFeature();
		const archivedAt = readRow(scenario.featureWorkspaceId)?.archivedAt;
		const reviveWorktree = cleanupGitOps.reviveWorktree;
		let ownerId = "";
		const setup = spyOn(cleanupGitOps, "reviveWorktree");
		setup.mockImplementation(async (...args) => {
			const result = await reviveWorktree(...args);
			expect(existsSync(scenario.worktreePath)).toBe(true);
			ownerId = seedWorkspace(scenario.host, {
				projectId: scenario.projectId,
				worktreePath: scenario.worktreePath,
				branch: scenario.branch,
			}).id;
			return result;
		});
		try {
			await expectCode(
				scenario.host.trpc.workspaceCleanup.revive.mutate({
					workspaceId: scenario.featureWorkspaceId,
				}),
				"CONFLICT",
			);
			expect(setup).toHaveBeenCalledTimes(1);
			expect(ownerId).not.toBe("");
			expect(readRow(ownerId)?.archivedAt).toBeNull();
			expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toEqual(
				archivedAt,
			);
			expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
				"archived",
			);
			expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
		} finally {
			setup.mockRestore();
		}
	});

	for (const replacement of ["repository", "wrong branch", "detached HEAD"]) {
		test(`rejects a locked stale registration replaced by ${replacement}`, async () => {
			await destroyFeature();
			const archived = readRow(scenario.featureWorkspaceId);
			await scenario.repo.git.raw([
				"worktree",
				"add",
				scenario.worktreePath,
				scenario.branch,
			]);
			await scenario.repo.git.raw(["worktree", "lock", scenario.worktreePath]);
			rmSync(scenario.worktreePath, { recursive: true, force: true });
			if (replacement === "repository") {
				await scenario.repo.git.raw([
					"clone",
					"--no-hardlinks",
					"--branch",
					scenario.branch,
					scenario.repo.repoPath,
					scenario.worktreePath,
				]);
			} else {
				const replacementPath = `${scenario.worktreePath}-replacement`;
				await scenario.repo.git.raw([
					"worktree",
					"add",
					...(replacement === "wrong branch"
						? ["-b", "replacement"]
						: ["--detach"]),
					replacementPath,
					`refs/heads/${scenario.branch}`,
				]);
				await scenario.repo.git.raw(["worktree", "lock", replacementPath]);
				renameSync(replacementPath, scenario.worktreePath);
			}
			const identity = await cleanupGitOps.readArchiveIdentity({
				worktreePath: scenario.worktreePath,
				gitEnv: {},
			});
			expect(identity.headSha).toBeTruthy();
			expect(identity.headRef).toBe(
				replacement === "repository"
					? `refs/heads/${scenario.branch}`
					: replacement === "wrong branch"
						? "refs/heads/replacement"
						: null,
			);
			const marker = join(scenario.worktreePath, "replacement.txt");
			writeFileSync(marker, "preserve replacement files");
			const setupDir = join(scenario.worktreePath, ".superset");
			mkdirSync(setupDir, { recursive: true });
			const setupScript = join(setupDir, "setup.sh");
			const script = "printf executed > replacement-setup-ran\n";
			writeFileSync(setupScript, script);
			const setup = spyOn(setupTerminal, "startSetupTerminalIfPresent");
			try {
				await expectCode(
					scenario.host.trpc.workspaceCleanup.revive.mutate({
						workspaceId: scenario.featureWorkspaceId,
					}),
					"PRECONDITION_FAILED",
				);
				expect(readRow(scenario.featureWorkspaceId)).toEqual(archived);
				expect(setup).not.toHaveBeenCalled();
				expect(
					existsSync(join(scenario.worktreePath, "replacement-setup-ran")),
				).toBe(false);
				expect(readFileSync(marker, "utf8")).toBe("preserve replacement files");
				expect(readFileSync(setupScript, "utf8")).toBe(script);
				expect(existsSync(join(scenario.worktreePath, ".git"))).toBe(true);
				const listed = await scenario.repo.git.raw([
					"worktree",
					"list",
					"--porcelain",
				]);
				expect(listed).toContain(`worktree ${scenario.worktreePath}`);
				expect(listed).toContain(
					`branch refs/heads/${scenario.branch}\nlocked`,
				);
			} finally {
				setup.mockRestore();
			}
		});
	}

	test("keeps a locked worktree archived when its directory is missing", async () => {
		const archivedAt = Date.now();
		scenario.host.db
			.update(workspaces)
			.set({ archivedAt, archiveReason: "archived" })
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.run();
		await scenario.repo.git.raw(["worktree", "lock", scenario.worktreePath]);
		rmSync(scenario.worktreePath, { recursive: true, force: true });

		await expectCode(
			scenario.host.trpc.workspaceCleanup.revive.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
			"PRECONDITION_FAILED",
		);

		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toEqual(
			archivedAt,
		);
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBe(
			"archived",
		);
		expect(existsSync(scenario.worktreePath)).toBe(false);
		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(`worktree ${scenario.worktreePath}`);
		expect(worktrees).toContain("locked");
	});

	test("restores a surviving registered worktree through a symlink alias", async () => {
		const aliasDir = join(scenario.repo.repoPath, "worktrees-alias");
		symlinkSync(dirname(scenario.worktreePath), aliasDir, "junction");
		const aliasPath = join(aliasDir, basename(scenario.worktreePath));
		scenario.host.db
			.update(workspaces)
			.set({
				worktreePath: aliasPath,
				archivedAt: Date.now(),
				archiveReason: "archived",
			})
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.run();

		const result = await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});

		expect(result.workspace.id).toBe(scenario.featureWorkspaceId);
		expect(readRow(scenario.featureWorkspaceId)?.worktreePath).toBe(aliasPath);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
		expect(readRow(scenario.featureWorkspaceId)?.archiveReason).toBeNull();
		expect(existsSync(join(aliasPath, ".git"))).toBe(true);
		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(`worktree ${scenario.worktreePath}`);
		expect(worktrees).not.toContain(`worktree ${aliasPath}`);
	});

	test("a revived workspace can be archived and revived again", async () => {
		await destroyFeature();
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		await destroyFeature();
		await scenario.host.trpc.workspaceCleanup.revive.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});

		expect(existsSync(scenario.worktreePath)).toBe(true);
		expect(readRow(scenario.featureWorkspaceId)?.archivedAt).toBeNull();
	});
});
