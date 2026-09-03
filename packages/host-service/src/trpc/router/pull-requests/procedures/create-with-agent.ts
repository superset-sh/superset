import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../../db";
import { hostAgentConfigs, workspaces } from "../../../../db/schema";
import { createGitEnvResolver } from "../../../../runtime/git";
import type { TerminalSessionError } from "../../../../terminal/terminal";
import { writeFramedInputToSession } from "../../../../terminal/terminal";
import type { TerminalAgentStore } from "../../../../terminal-agents";
import type { HostServiceContext } from "../../../../types";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import {
	type GitPrContextResult,
	gitPrContextTask,
} from "../../../../workers/tasks/git";
import { protectedProcedure } from "../../../index";
import { resolveWorktreePath } from "../../git/utils/resolve-worktree";
import { toTerminalSessionError } from "../../terminal/errors";
import { buildCreatePrPrompt } from "../utils/create-pr-prompt";
import {
	type CreatePrSkillSource,
	resolveCreatePrSkill,
} from "../utils/create-pr-skill";
import {
	getHeadlessCreatePrRun,
	HeadlessCreatePrAlreadyRunning,
	type HeadlessCreatePrCommand,
	type HeadlessCreatePrRun,
	resolveHeadlessCreatePrCommand,
	startHeadlessCreatePr,
} from "../utils/headless-create-pr";

const createWithAgentInput = z.object({
	workspaceId: z.string(),
	/** A live agent terminal to send the prompt to. Omitted → headless run. */
	terminalId: z.string().optional(),
	/** Host agent config (or preset) id for the headless run; defaults to the
	 * first configured agent. Ignored when `terminalId` is set. */
	agent: z.string().min(1).optional(),
	draft: z.boolean().default(false),
});

export type CreateWithAgentInput = z.infer<typeof createWithAgentInput>;

export type CreateWithAgentResult =
	| {
			mode: "terminal";
			terminalId: string;
			agentId: string;
			skillSource: CreatePrSkillSource;
	  }
	| {
			mode: "headless";
			presetId: string;
			agentLabel: string;
			skillSource: CreatePrSkillSource;
	  };

export interface CreateWithAgentDeps {
	db: HostDb;
	terminalAgentStore: Pick<TerminalAgentStore, "listByWorkspace">;
	readPrContext: (worktreePath: string) => Promise<GitPrContextResult>;
	resolveSkill: typeof resolveCreatePrSkill;
	sendToTerminal: (args: {
		workspaceId: string;
		terminalId: string;
		text: string;
	}) => Promise<{ success: true } | TerminalSessionError>;
	resolveHeadlessCommand: (agent: string) => HeadlessCreatePrCommand | null;
	startHeadless: typeof startHeadlessCreatePr;
	/** Best-effort PR link refresh once a headless run exits cleanly. */
	onHeadlessFinished?: (run: HeadlessCreatePrRun) => void;
}

function contextFailure(reason: "detached-head" | "no-base" | "on-base") {
	switch (reason) {
		case "detached-head":
			return "Cannot create a pull request from a detached HEAD";
		case "no-base":
			return "Could not determine a base branch for the pull request";
		case "on-base":
			return "This branch is the base branch — nothing to open a pull request from";
	}
}

/**
 * Dispatches PR creation to an agent: gathers the branch context off-loop,
 * resolves the (overridable) `create-pr` skill, and either pastes the prompt
 * into a live agent terminal or runs the agent CLI headlessly in the
 * worktree. The PR itself surfaces through the usual link sync once the
 * agent has run `gh pr create`.
 */
export async function createPullRequestWithAgent(
	deps: CreateWithAgentDeps,
	input: CreateWithAgentInput & { worktreePath: string },
): Promise<CreateWithAgentResult> {
	const workspace = deps.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, input.workspaceId) })
		.sync();
	if (!workspace?.projectId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Workspace has no linked project, so there is no repository to open a pull request on",
		});
	}

	const result = await deps.readPrContext(input.worktreePath);
	if (!result.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: contextFailure(result.reason),
		});
	}
	const { context } = result;
	if (context.commits.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No commits ahead of ${context.base.name} to open a pull request from`,
		});
	}

	const skill = await deps.resolveSkill({ worktreePath: input.worktreePath });
	if (!skill) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The create-pr skill is missing from this Superset install — reinstall or add .agents/skills/create-pr/SKILL.md to the repository",
		});
	}
	const prompt = sanitizePromptForPty(
		buildCreatePrPrompt({ skill, context, draft: input.draft }),
	);

	if (input.terminalId) {
		const binding = deps.terminalAgentStore
			.listByWorkspace(input.workspaceId)
			.find((candidate) => candidate.terminalId === input.terminalId);
		if (!binding) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "That agent session is no longer running",
				cause: { kind: "SESSION_NOT_ACTIVE" },
			});
		}
		const sent = await deps.sendToTerminal({
			workspaceId: input.workspaceId,
			terminalId: input.terminalId,
			text: prompt,
		});
		if ("error" in sent) throw toTerminalSessionError(sent);
		return {
			mode: "terminal",
			terminalId: input.terminalId,
			agentId: binding.agentId,
			skillSource: skill.source,
		};
	}

	const agent =
		input.agent ??
		deps.db
			.select({ id: hostAgentConfigs.id })
			.from(hostAgentConfigs)
			.orderBy(asc(hostAgentConfigs.displayOrder))
			.get()?.id;
	const headless = agent ? deps.resolveHeadlessCommand(agent) : null;
	if (!headless) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"No agent is running in this workspace, and the default agent can't run headlessly with git access — open an agent terminal here and try again",
			cause: { kind: "NO_HEADLESS_AGENT" },
		});
	}
	try {
		deps.startHeadless({
			workspaceId: input.workspaceId,
			presetId: headless.presetId,
			command: headless.command,
			prompt,
			cwd: input.worktreePath,
			onFinished: deps.onHeadlessFinished,
		});
	} catch (error) {
		if (error instanceof HeadlessCreatePrAlreadyRunning) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"An agent is already creating a pull request for this workspace",
			});
		}
		throw error;
	}
	return {
		mode: "headless",
		presetId: headless.presetId,
		agentLabel: headless.label,
		skillSource: skill.source,
	};
}

export function buildCreateWithAgentDeps(
	ctx: HostServiceContext,
): CreateWithAgentDeps {
	return {
		db: ctx.db,
		terminalAgentStore: ctx.terminalAgentStore,
		readPrContext: async (worktreePath) => {
			const gitEnv = await createGitEnvResolver(ctx.credentials)(worktreePath);
			return getHostWorkerPool().run(
				gitPrContextTask,
				{ worktreePath, gitEnv },
				{ timeoutMs: 30_000 },
			);
		},
		resolveSkill: resolveCreatePrSkill,
		sendToTerminal: ({ workspaceId, terminalId, text }) =>
			writeFramedInputToSession({
				workspaceId,
				terminalId,
				text,
				submit: true,
				db: ctx.db,
				eventBus: ctx.eventBus,
			}),
		resolveHeadlessCommand: (agent) =>
			resolveHeadlessCreatePrCommand(ctx.db, agent),
		startHeadless: startHeadlessCreatePr,
		onHeadlessFinished: (run) => {
			if (run.status !== "succeeded") return;
			// The PR exists at this point; the background sync would link it
			// within a pass anyway, so a refresh hiccup is only logged.
			ctx.runtime.pullRequests
				.refreshPullRequestsByWorkspaces([run.workspaceId])
				.catch((error) => {
					console.warn(
						"[pull-requests:create-with-agent] headless run finished but PR link refresh failed",
						{ workspaceId: run.workspaceId, error },
					);
				});
		},
	};
}

export const createWithAgent = protectedProcedure
	.input(createWithAgentInput)
	.mutation(async ({ ctx, input }) => {
		const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
		return createPullRequestWithAgent(buildCreateWithAgentDeps(ctx), {
			...input,
			worktreePath,
		});
	});

/** State of the workspace's headless create-PR run, for the renderer's
 * in-progress face. Null when no run is tracked. */
export const agentCreateStatus = protectedProcedure
	.input(z.object({ workspaceId: z.string() }))
	.query(({ input }) => {
		const run = getHeadlessCreatePrRun(input.workspaceId);
		if (!run) return null;
		return {
			status: run.status,
			presetId: run.presetId,
			startedAt: run.startedAt,
			finishedAt: run.finishedAt ?? null,
			error: run.error ?? null,
		};
	});
