import { beforeEach, expect, jest, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { HostServiceContext } from "../../../types";

if (process.env.SUPERSET_GITLAB_BOUND_CONSUMER !== "1") {
	test("bound consumers use an isolated owned boundary", () => {
		const cwd = mkdtempSync("/tmp/superset-gl-bound-consumer-");
		try {
			const child = spawnSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_BOUND_CONSUMER: "1",
					},
					timeout: 30000,
					stdio: "pipe",
				},
			);
			process.stdout.write(child.stdout ?? "");
			process.stderr.write(child.stderr ?? "");
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35000);
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Unexpected transport");
		},
		{ preconnect() {} },
	);
	const dotenv: string = "dotenv";
	const dotenvOwner = { config: () => ({ parsed: {} }) };
	mock.module(dotenv, () => dotenvOwner);
	expect(Object.is((await import(dotenv)).config, dotenvOwner.config)).toBe(
		true,
	);
	const { z } = await import("zod");
	const expected = {
		provider: "gitlab" as const,
		projectId: "project",
		host: "gl.example.test:8443",
		owner: "Group/Sub",
		repo: "App",
		pullNumber: 7,
		expectedUrl:
			"https://gl.example.test:8443/Group/Sub/App/-/merge_requests/7",
	};
	const workspace = {
		id: "00000000-0000-4000-8000-000000000001",
		projectId: "project",
		createdAt: 10,
		type: "worktree",
		worktreePath: "/virtual/worktree",
		branch: "Feature",
		pullRequestId: "pr",
		archivedAt: null,
	};
	let calls: string[] = [],
		commands: string[] = [],
		hasSetup = true,
		valid = true,
		agent = false,
		failSend = false;
	const helperOwner = {
		assertExpectedGitlabRemote: () => {
			throw Error("Unexpected checkout in consumer fixture");
		},
		resolveExpectedGitlabPullRequest: async () => {
			throw Error("Unexpected checkout in consumer fixture");
		},
		expectedGitlabPullRequestSchema: z
			.object({
				provider: z.literal("gitlab"),
				projectId: z.string(),
				host: z.string(),
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
				expectedUrl: z.string(),
			})
			.strict(),
		acquireExpectedGitlabDelivery: async (
			_ctx: unknown,
			id: string,
			binding: unknown,
			initial: unknown,
		) => {
			calls.push("acquire");
			expect(id).toBe(workspace.id);
			expect(binding).toEqual(expected);
			expect(initial).toEqual({
				id: workspace.id,
				projectId: "project",
				createdAtMs: 10,
				type: workspace.type,
				worktreePath: workspace.worktreePath,
				branch: "Feature",
				pullRequestId: "pr",
			});
			return valid ? { isValid: () => valid } : null;
		},
	};
	mock.module("./gitlab-actions", () => helperOwner);
	const helperModule = await import("./gitlab-actions");
	expect(
		Object.is(
			helperModule.acquireExpectedGitlabDelivery,
			helperOwner.acquireExpectedGitlabDelivery,
		),
	).toBe(true);
	const originalTerminal = await import("../../../terminal/terminal");
	const terminalOwner = {
		...originalTerminal,
		parseThemeType: () => "dark",
		createTerminalSessionInternal: async (options: {
			terminalId: string;
			initialCommand?: string;
			initialDelivery?: {
				acquireDelivery(): Promise<{ isValid(): boolean } | null>;
				refuse(): void;
				submitted(): void;
				settled: Promise<unknown>;
			};
		}) => {
			calls.push("create");
			if (options.initialCommand) commands.push(options.initialCommand);
			if (options.initialDelivery) {
				const permit = await options.initialDelivery.acquireDelivery();
				if (!permit?.isValid()) options.initialDelivery.refuse();
				else options.initialDelivery.submitted();
			}
			return { terminalId: options.terminalId };
		},
		sendAgentMessage: async (options: {
			acquireDelivery?: () => Promise<{ isValid(): boolean } | null>;
		}) => {
			calls.push("agent-send");
			const permit = await options.acquireDelivery?.();
			return failSend || (options.acquireDelivery && !permit?.isValid())
				? { kind: "SESSION_NOT_ACTIVE", error: "refused" }
				: { success: true };
		},
		writeFramedInputToSession: async (options: {
			acquireDelivery?: () => Promise<{ isValid(): boolean } | null>;
		}) => {
			calls.push("generic-send");
			const permit = await options.acquireDelivery?.();
			return options.acquireDelivery && !permit?.isValid()
				? { kind: "SESSION_NOT_ACTIVE", error: "refused" }
				: { success: true };
		},
	};
	mock.module("../../../terminal/terminal", () => terminalOwner);
	const terminalModule = await import("../../../terminal/terminal");
	expect(
		Object.is(terminalModule.sendAgentMessage, terminalOwner.sendAgentMessage),
	).toBe(true);
	const configOwner = {
		resolveHostAgentConfig: () => ({
			presetId: "codex",
			label: "Codex",
			command: "codex",
			args: [],
			promptArgs: [],
			promptTransport: "argv",
			resumeArgs: [],
			forkArgs: [],
		}),
		agentLaunchEnv: () => ({}),
	};
	mock.module("../../../terminal-agents/agent-config", () => configOwner);
	expect(
		Object.is(
			(await import("../../../terminal-agents/agent-config"))
				.resolveHostAgentConfig,
			configOwner.resolveHostAgentConfig,
		),
	).toBe(true);
	const setupConfig = await import("../../../runtime/setup/config");
	const setupOwner = {
		...setupConfig,
		resolveScript: () =>
			hasSetup ? { kind: "commands", commands: ["printf setup"] } : null,
	};
	mock.module("../../../runtime/setup/config", () => setupOwner);
	expect(
		Object.is(
			(await import("../../../runtime/setup/config")).resolveScript,
			setupOwner.resolveScript,
		),
	).toBe(true);
	const { dispatchSugarAgents } = await import(
		"../workspace-creation/shared/dispatch-agents"
	);
	const { startCommandTerminal } = await import(
		"../workspace-creation/shared/command-terminal"
	);
	const { startSetupTerminalIfPresent } = await import(
		"../workspace-creation/shared/setup-terminal"
	);
	const { agentsRouter } = await import("../agents/agents");
	const { terminalRouter } = await import("../terminal/terminal");
	const ctx = {
		isAuthenticated: true,
		organizationId: "org",
		eventBus: undefined,
		db: {
			select: () => ({
				from: () => ({
					innerJoin: () => ({
						where: () => ({
							get: () => ({
								worktreePath: workspace.worktreePath,
								repoPath: "/virtual/project",
								projectId: workspace.projectId,
							}),
						}),
					}),
				}),
			}),
			query: { workspaces: { findFirst: () => ({ sync: () => workspace }) } },
		},
		terminalAgentStore: {
			listByWorkspace: () =>
				agent
					? [
							{
								terminalId: "terminal",
								workspaceId: workspace.id,
								agentId: "codex",
							},
						]
					: [],
			get: () =>
				agent
					? { terminalId: "terminal", workspaceId: workspace.id }
					: undefined,
		},
	} as unknown as HostServiceContext;
	beforeEach(() => {
		calls = [];
		commands = [];
		hasSetup = true;
		valid = true;
		agent = false;
		failSend = false;
		workspace.type = "worktree";
	});
	for (const effect of ["send", "run"]) {
		test(`actual ${effect} accepts a currently linked local/main workspace`, async () => {
			workspace.type = "local";
			if (effect === "send") {
				const result = await terminalRouter.createCaller(ctx).send({
					terminalId: "terminal",
					workspaceId: workspace.id,
					text: "bound",
					expectedPullRequest: expected,
				});
				expect(result.submitted).toBe(true);
			} else {
				const result = await agentsRouter.createCaller(ctx).run({
					workspaceId: workspace.id,
					agent: "codex",
					prompt: "bound",
					expectedPullRequest: expected,
				});
				expect(result.sessionId).toBeTruthy();
			}
			expect(calls).toContain("acquire");
		});
	}
	test("actual agents.run retains revoked binding on fresh launch", async () => {
		valid = false;
		await expect(
			agentsRouter.createCaller(ctx).run({
				workspaceId: workspace.id,
				agent: "codex",
				prompt: "bound",
				...{ expectedPullRequest: expected },
			}),
		).rejects.toThrow();
		expect(calls).toContain("acquire");
	});
	test("actual agents.run does not turn bound continuation refusal into a fresh launch", async () => {
		agent = true;
		valid = false;
		await expect(
			agentsRouter.createCaller(ctx).run({
				workspaceId: workspace.id,
				agent: "codex",
				prompt: "bound",
				continueTerminalId: "terminal",
				...{ expectedPullRequest: expected },
			}),
		).rejects.toThrow();
		expect(calls).not.toContain("create");
	});
	for (const activeAgent of [false, true]) {
		test(`actual terminal.send refuses revoked binding (${activeAgent ? "agent" : "generic"})`, async () => {
			agent = activeAgent;
			valid = false;
			await expect(
				terminalRouter.createCaller(ctx).send({
					terminalId: "terminal",
					workspaceId: workspace.id,
					text: "bound",
					...{ expectedPullRequest: expected },
				}),
			).rejects.toThrow();
			expect(calls).toContain("acquire");
		});
		test(`actual terminal.send carries complete bound identity (${activeAgent ? "agent" : "generic"})`, async () => {
			agent = activeAgent;
			const result = await terminalRouter.createCaller(ctx).send({
				terminalId: "terminal",
				workspaceId: workspace.id,
				text: "bound",
				...{ expectedPullRequest: expected },
			});
			expect(result.submitted).toBe(true);
			expect(calls).toContain("acquire");
		});
	}
	const bound = {
		expectedPullRequest: expected,
		initialWorkspace: {
			id: workspace.id,
			projectId: workspace.projectId,
			createdAtMs: 10,
			type: "worktree",
			worktreePath: workspace.worktreePath,
			branch: "Feature",
			pullRequestId: "pr",
		},
	};
	const launch = (kind: string) =>
		kind === "sugar"
			? dispatchSugarAgents(
					ctx,
					workspace.id,
					[{ agent: "codex", prompt: "bound" }],
					bound,
				)
			: kind === "command"
				? startCommandTerminal({
						ctx,
						workspaceId: workspace.id,
						command: "printf command",
						expectedDelivery: bound,
					})
				: startSetupTerminalIfPresent({
						ctx,
						workspaceId: workspace.id,
						expectedDelivery: bound,
						...(kind === "setup-chain"
							? { chainCommand: "printf chained" }
							: {}),
					});
	for (const kind of ["sugar", "command", "setup", "setup-chain"]) {
		test(`actual ${kind} caller carries authority and does not swallow refusal`, async () => {
			valid = false;
			await expect(launch(kind)).rejects.toThrow();
			expect(calls).toContain("acquire");
		});
		test(`actual ${kind} caller preserves command bytes and accepts confirmed delivery`, async () => {
			await launch(kind);
			expect(calls).toContain("acquire");
			if (kind !== "sugar")
				expect(commands).toEqual([
					kind === "command"
						? "printf command"
						: kind === "setup-chain"
							? "printf setup && printf chained"
							: "printf setup",
				]);
		});
	}
	test("bound setup no-op does not create a delivery handle or infer submission", async () => {
		hasSetup = false;
		expect(
			await startSetupTerminalIfPresent({
				ctx,
				workspaceId: workspace.id,
				expectedDelivery: bound,
			}),
		).toEqual({ terminal: null, warning: null, chained: false });
		expect(calls).toEqual([]);
	});
	test("genuine request handle closes at the 25-second boundary and never inherits success", async () => {
		jest.useFakeTimers();
		try {
			const handle = originalTerminal.createInitialCommandDelivery(
				async () => ({ isValid: () => true }),
			);
			jest.advanceTimersByTime(24_999);
			expect(handle.isClosed()).toBe(false);
			jest.advanceTimersByTime(1);
			expect(handle.isClosed()).toBe(true);
			const outcome = await handle.settled;
			expect("error" in outcome).toBe(true);
			handle.submitted();
			expect(await handle.settled).toBe(outcome);
		} finally {
			jest.useRealTimers();
		}
	});
	test("genuine request handle awaits cleanup and exposes actual removal failure", async () => {
		const gate = Promise.withResolvers<void>();
		const handle = originalTerminal.createInitialCommandDelivery(
			async () => null,
		);
		handle.markInputStaged();
		handle.setCleanup(() => gate.promise);
		handle.refuse();
		let settled = false;
		void handle.settled.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		gate.reject(Error("owned unlink failure"));
		const outcome = await handle.settled;
		expect("error" in outcome).toBe(true);
		if ("error" in outcome) {
			expect(outcome.inputStaged).toBe(true);
			expect(outcome.error).toContain("owned unlink failure");
		}
	});
	test("absent expected input preserves generic send without authority I/O", async () => {
		await terminalRouter.createCaller(ctx).send({
			terminalId: "terminal",
			workspaceId: workspace.id,
			text: "ordinary",
		});
		expect(calls).toEqual(["generic-send"]);
	});
}
