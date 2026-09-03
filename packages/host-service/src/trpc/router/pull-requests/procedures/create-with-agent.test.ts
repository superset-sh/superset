import { describe, expect, test } from "bun:test";
import type { GitPrContextResult } from "../../../../workers/tasks/git";
import type { PrContext } from "../utils/pr-context";
import {
	type CreateWithAgentDeps,
	createPullRequestWithAgent,
} from "./create-with-agent";

const context: PrContext = {
	head: "feat/x",
	base: { name: "main", ref: "origin/main" },
	commits: [{ hash: "a", shortHash: "a1", subject: "feat: x", body: "" }],
	files: [],
	patch: { text: "", includedFiles: 0, omittedFiles: 0, truncated: false },
	hasUncommitted: false,
	unpushedCommits: 0,
};

function makeDeps(
	overrides: Partial<CreateWithAgentDeps> & {
		projectId?: string | null;
		prContext?: GitPrContextResult;
		bindings?: Array<{ terminalId: string; agentId: string }>;
		firstAgent?: string | null;
	} = {},
) {
	const sent: Array<{ terminalId: string; text: string }> = [];
	const started: Array<Parameters<CreateWithAgentDeps["startHeadless"]>[0]> =
		[];
	const deps: CreateWithAgentDeps = {
		db: {
			query: {
				workspaces: {
					findFirst: () => ({
						sync: () => ({
							id: "ws",
							projectId:
								overrides.projectId === undefined
									? "proj"
									: overrides.projectId,
						}),
					}),
				},
			},
			select: () => ({
				from: () => ({
					orderBy: () => ({
						get: () =>
							overrides.firstAgent === null
								? undefined
								: { id: overrides.firstAgent ?? "cfg-1" },
					}),
				}),
			}),
		} as unknown as CreateWithAgentDeps["db"],
		terminalAgentStore: {
			listByWorkspace: () =>
				(overrides.bindings ?? []).map((b) => ({
					...b,
					workspaceId: "ws",
					startedAt: 0,
					lastEventAt: 0,
					lastEventType: "Stop",
				})) as never,
		},
		readPrContext: async () => overrides.prContext ?? { ok: true, context },
		resolveSkill: async () => ({
			source: "bundled",
			path: "/bundle/SKILL.md",
			body: "skill body",
		}),
		sendToTerminal: async ({ terminalId, text }) => {
			sent.push({ terminalId, text });
			return { success: true };
		},
		resolveHeadlessCommand: (agent) =>
			agent === "cfg-1"
				? { presetId: "claude", label: "Claude", command: "claude -p" }
				: null,
		startHeadless: (args) => {
			started.push(args);
			return {
				workspaceId: args.workspaceId,
				presetId: args.presetId,
				startedAt: 0,
				status: "running",
			};
		},
		...overrides,
	};
	return { deps, sent, started };
}

const input = { workspaceId: "ws", worktreePath: "/wt", draft: false };

describe("createPullRequestWithAgent", () => {
	test("pastes the prompt into a live agent terminal", async () => {
		const { deps, sent, started } = makeDeps({
			bindings: [{ terminalId: "t1", agentId: "claude" }],
		});
		const result = await createPullRequestWithAgent(deps, {
			...input,
			terminalId: "t1",
		});
		expect(result).toEqual({
			mode: "terminal",
			terminalId: "t1",
			agentId: "claude",
			skillSource: "bundled",
		});
		expect(started).toHaveLength(0);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.text).toContain('<skill name="create-pr">\nskill body');
		expect(sent[0]?.text).toContain("Branch: feat/x");
		expect(sent[0]?.text).not.toContain("--draft");
	});

	test("a dead terminal is NOT_FOUND so the renderer drops the binding", async () => {
		const { deps } = makeDeps({ bindings: [] });
		await expect(
			createPullRequestWithAgent(deps, { ...input, terminalId: "gone" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("runs the default agent headlessly in the worktree when no terminal is given", async () => {
		const { deps, sent, started } = makeDeps();
		const result = await createPullRequestWithAgent(deps, {
			...input,
			draft: true,
		});
		expect(result).toEqual({
			mode: "headless",
			presetId: "claude",
			agentLabel: "Claude",
			skillSource: "bundled",
		});
		expect(sent).toHaveLength(0);
		expect(started).toHaveLength(1);
		expect(started[0]?.cwd).toBe("/wt");
		expect(started[0]?.command).toBe("claude -p");
		expect(started[0]?.prompt).toContain("Open it as a draft");
	});

	test("an explicit agent without a headless command is a precondition failure", async () => {
		const { deps } = makeDeps();
		await expect(
			createPullRequestWithAgent(deps, { ...input, agent: "cfg-opencode" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("no configured agent at all is a precondition failure", async () => {
		const { deps } = makeDeps({ firstAgent: null });
		await expect(createPullRequestWithAgent(deps, input)).rejects.toMatchObject(
			{
				code: "PRECONDITION_FAILED",
			},
		);
	});

	test("gates on commits ahead of the base and on a usable HEAD", async () => {
		const empty = makeDeps({
			prContext: { ok: true, context: { ...context, commits: [] } },
		});
		await expect(createPullRequestWithAgent(empty.deps, input)).rejects.toThrow(
			"No commits ahead of main",
		);
		const detached = makeDeps({
			prContext: { ok: false, reason: "detached-head" },
		});
		await expect(
			createPullRequestWithAgent(detached.deps, input),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			createPullRequestWithAgent(detached.deps, input),
		).rejects.toThrow("detached HEAD");
	});

	test("session workspaces cannot open PRs", async () => {
		const { deps } = makeDeps({ projectId: null });
		await expect(createPullRequestWithAgent(deps, input)).rejects.toMatchObject(
			{
				code: "BAD_REQUEST",
			},
		);
	});
});
