import { isBuiltinAgentId } from "@superset/shared/agent-catalog";
import { FORK_SESSION_ID_TOKEN } from "@superset/shared/agent-definition";
import {
	buildAgentEffortArgs,
	buildAgentModeArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
	getAgentEffortSupport,
	getAgentEfforts,
	getAgentModelSupport,
	getAgentModeSupport,
	isCuratedAgentModel,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import {
	buildArgvCommand,
	buildPromptCommandString,
	envOverlayPrefix,
	sanitizePromptForPty,
} from "@superset/shared/agent-prompt-launch";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs, workspaces } from "../../../db/schema";
import { hasHarnessSession } from "../../../terminal/harness-transcript";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";
import { toTerminalSessionError } from "../terminal/errors";
import { resolveDefaultAccountEnv } from "../usage/default-account";
import { seedAgentFolderTrust } from "../workspace-creation/shared/seed-agent-trust";

interface ResolvedHostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	resumeArgs: string[];
	forkArgs: string[];
	env: Record<string, string>;
}

function parseArgv(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		if (
			!Array.isArray(parsed) ||
			parsed.some((entry) => typeof entry !== "string")
		) {
			return [];
		}
		return parsed as string[];
	} catch {
		return [];
	}
}

function parseEnv(value: string): Record<string, string> {
	try {
		const parsed = JSON.parse(value);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			Object.values(parsed).some((entry) => typeof entry !== "string")
		) {
			return {};
		}
		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

function rowToConfig(
	row: typeof hostAgentConfigs.$inferSelect,
): ResolvedHostAgentConfig {
	return {
		id: row.id,
		presetId: row.presetId,
		label: row.label,
		command: row.command,
		args: parseArgv(row.argsJson),
		promptTransport: row.promptTransport as "argv" | "stdin",
		promptArgs: parseArgv(row.promptArgsJson),
		resumeArgs: parseArgv(row.resumeArgsJson),
		forkArgs: parseArgv(row.forkArgsJson),
		env: parseEnv(row.envJson),
	};
}

/**
 * Look up a HostAgentConfig by its instance id first, then fall back to the
 * lowest-`order` row matching by presetId. Preset ids are short slugs;
 * instance ids are UUIDs — they don't collide.
 */
export function resolveHostAgentConfig(
	db: HostDb,
	agent: string,
): ResolvedHostAgentConfig | null {
	const byId = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.id, agent))
		.get();
	if (byId) return rowToConfig(byId);

	const byPreset = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.presetId, agent))
		.orderBy(asc(hostAgentConfigs.displayOrder))
		.get();
	if (byPreset) return rowToConfig(byPreset);

	return null;
}

/**
 * Build a shell command string that runs the resolved agent config with the
 * given prompt. argv transport appends the prompt as a quoted positional;
 * stdin transport delegates heredoc assembly and delimiter collision handling
 * to the shared prompt-launch pipeline.
 *
 * Prompts that sanitize to empty drop `promptArgs` and the prompt payload so
 * codex/opencode/copilot don't get stray prompt-mode flags during promptless
 * launches — emptiness is only knowable after sanitization, so the check
 * lives here rather than in the router's zod schema.
 *
 * `resumeSessionId` splices the config's `resumeArgs` plus the session id
 * after the base args (e.g. "claude … --resume <id>"), restoring a previous
 * session instead of starting a fresh one. A prompt may still follow it.
 */
export function buildAgentCommandString(
	config: ResolvedHostAgentConfig,
	rawPrompt: string,
	modelArgs: string[] = [],
	options: {
		resumeSessionId?: string;
		forkSessionId?: string;
		randomId?: string;
	} = {},
): string {
	const randomId = options.randomId ?? crypto.randomUUID();
	const prompt = sanitizePromptForPty(rawPrompt);
	const resumeArgv = options.resumeSessionId
		? [...config.resumeArgs, sanitizePromptForPty(options.resumeSessionId)]
		: [];
	const forkArgv = options.forkSessionId
		? buildForkArgv(config.forkArgs, options.forkSessionId)
		: [];
	const baseArgv = [
		config.command,
		...config.args,
		...modelArgs,
		...resumeArgv,
		...forkArgv,
	];

	if (prompt === "") {
		return buildArgvCommand(baseArgv);
	}

	if (config.promptTransport === "argv") {
		// Plain quoted positional, not the shared "$(cat <<…)" form: the command
		// is typed into the user's configured shell, and fish has no heredocs.
		return buildArgvCommand([...baseArgv, ...config.promptArgs, prompt]);
	}

	return buildPromptCommandString({
		command: buildArgvCommand([...baseArgv, ...config.promptArgs]),
		transport: "stdin",
		prompt,
		randomId,
	});
}

function buildForkArgv(forkArgs: string[], rawSessionId: string): string[] {
	const sessionId = sanitizePromptForPty(rawSessionId);
	let replaced = false;
	const argv = forkArgs.map((arg) => {
		if (!arg.includes(FORK_SESSION_ID_TOKEN)) return arg;
		replaced = true;
		// Substituted within the argument, since the settings hint invites
		// forms like `--session-id={sessionId}`; whole-arg matching passed the
		// literal token through and appended the id as a stray extra.
		return arg.replaceAll(FORK_SESSION_ID_TOKEN, sessionId);
	});
	return replaced ? argv : [...argv, sessionId];
}

function buildAttachmentBlock(
	prompt: string,
	resolved: Array<{ attachmentId: string; path: string }>,
): string {
	if (resolved.length === 0) return prompt;
	const lines = resolved.map((item) => `- ${item.path}`);
	const block = `\n\n# Attached files\n\nThe user attached these files. They are available on this host at:\n\n${lines.join("\n")}`;
	return prompt + block;
}

export interface AgentRunInput {
	workspaceId: string;
	agent: string;
	prompt: string;
	attachmentIds?: string[];
	model?: string;
	effort?: string;
	mode?: string;
	/** Session id of a previous run of this agent to restore (e.g. a killed
	 * session's `agentSessionId`). The prompt may be empty when resuming. */
	resumeSessionId?: string;
	/** Session id to clone into a new provider-owned session. */
	forkSessionId?: string;
}

export type AgentRunResult = {
	kind: "terminal";
	sessionId: string;
	label: string;
};

/**
 * Validate an explicit model override before launch. Omitting model always
 * delegates to the underlying agent's own default.
 *
 * Without this the launch builder silently drops an id outside the curated
 * list, so a stale or mistyped model reads as "Superset ignored my choice":
 * the agent starts on its own default with no flag, no warning, and a
 * success exit code.
 */
export function validateAgentModelSelection(
	presetId: string,
	label: string,
	model: string | undefined,
): void {
	if (!model) return;

	const support = getAgentModelSupport(presetId);
	if (!support) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} does not support a model override. Omit model to use the agent default.`,
		});
	}

	if (!isCuratedAgentModel(presetId, model)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported model "${model}" for ${label}. Choose one of: ${support.models.map((option) => option.id).join(", ")}.`,
		});
	}
}

/**
 * Validate an explicit effort override before launch. Omitting effort always
 * delegates to the underlying agent's own default.
 */
export function validateAgentEffortSelection(
	presetId: string,
	label: string,
	effort: string | undefined,
	model?: string,
): void {
	if (!effort) return;

	const support = getAgentEffortSupport(presetId);
	if (!support) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} does not support a reasoning effort override. Omit effort to use the agent default.`,
		});
	}

	// Some efforts only exist on some of the agent's models (Codex's max and
	// ultra need GPT-5.6; cursor-agent only has a ladder for some models),
	// so the accepted set follows the selected model.
	const efforts = getAgentEfforts(presetId, model);
	if (efforts.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} does not support a reasoning effort override${model ? ` with model ${model}` : " without a model"}. Omit effort to use the agent default.`,
		});
	}
	if (!efforts.some((option) => option.id === effort)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported reasoning effort "${effort}" for ${label}${model ? ` with model ${model}` : ""}. Choose one of: ${efforts.map((option) => option.id).join(", ")}.`,
		});
	}
}

/**
 * Validate an explicit launch mode before launch. Omitting mode delegates to
 * the underlying agent's default behaviour.
 */
export function validateAgentModeSelection(
	presetId: string,
	label: string,
	mode: string | undefined,
): void {
	if (!mode) return;

	const support = getAgentModeSupport(presetId);
	if (!support) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} does not support a launch mode override. Omit mode to use the agent default.`,
		});
	}

	if (!support.modes.some((option) => option.id === mode)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported launch mode "${mode}" for ${label}. Choose one of: ${support.modes.map((option) => option.id).join(", ")}.`,
		});
	}
}

/**
 * Validate an explicit resume request before launch. Resumability is a
 * per-config capability: configs without `resumeArgs` have no id-based
 * resume form to splice the session id into.
 */
export function validateAgentResumeSelection(
	config: Pick<ResolvedHostAgentConfig, "label" | "resumeArgs">,
	resumeSessionId: string | undefined,
): void {
	if (resumeSessionId === undefined) return;

	if (config.resumeArgs.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${config.label} does not support resuming a session by id. Omit resumeSessionId to start a new session.`,
		});
	}

	if (sanitizePromptForPty(resumeSessionId).trim() === "") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid resume session id for ${config.label}.`,
		});
	}
}

export function validateAgentForkSelection(
	config: Pick<ResolvedHostAgentConfig, "label" | "forkArgs">,
	forkSessionId: string | undefined,
): void {
	if (forkSessionId === undefined) return;

	if (config.forkArgs.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${config.label} does not support forking a session by id. Omit forkSessionId to start a new session.`,
		});
	}

	if (sanitizePromptForPty(forkSessionId).trim() === "") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid fork session id for ${config.label}.`,
		});
	}
}

/**
 * Refuse a fork the harness can no longer resolve.
 *
 * Providers prune their session stores, and a `codex exec` session leaves no
 * rollout at all. Without this the launch succeeds, the pane opens, and the
 * harness reports "no rollout found for thread id" inside it — an error about
 * a click the user made somewhere else entirely.
 *
 * Only a confident `false` refuses. A harness that keeps sessions server-side
 * (grok) or in a layout we do not read answers `null`, and those launch as
 * before rather than being blocked on our ignorance.
 */
function validateForkSessionIsResolvable(
	db: HostDb,
	config: ResolvedHostAgentConfig,
	input: AgentRunInput,
): void {
	if (!input.forkSessionId) return;
	const worktreePath = db
		.select({ path: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.id, input.workspaceId))
		.get()?.path;
	// The same env the launch will run under: an agent pinned to its own
	// provider account keeps its sessions in that account's directory, and
	// looking in the default one would refuse a fork that would have worked.
	const launchEnv = {
		...resolveDefaultAccountEnv(db, config.presetId),
		...config.env,
	};
	const resolvable = hasHarnessSession({
		agentId: config.presetId,
		sessionId: input.forkSessionId,
		worktreePath,
		env: launchEnv,
	});
	if (resolvable === false) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${config.label} no longer has session ${input.forkSessionId}, so there is nothing to fork. Start a new session instead.`,
		});
	}
}

/**
 * Preflight a host-scoped launch before any larger workflow (such as
 * workspace creation) performs side effects.
 */
export function validateAgentLaunchOptions(
	db: HostDb,
	input: Pick<AgentRunInput, "agent" | "model" | "effort" | "mode">,
): void {
	if (!input.model && !input.effort && !input.mode) return;

	const config = resolveHostAgentConfig(db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}
	const launchPresetId = resolveAgentLaunchPresetId(
		config.presetId,
		config.command,
	);
	validateAgentModelSelection(launchPresetId, config.label, input.model);
	validateAgentEffortSelection(
		launchPresetId,
		config.label,
		input.effort,
		input.model,
	);
	validateAgentModeSelection(launchPresetId, config.label, input.mode);
}

/**
 * Resolve a terminal agent launch to the shell command that runs it, without
 * creating a terminal. Used by `runTerminalAgent` and by the workspace-create
 * wait-for-setup gate, which chains this command behind the setup commands in
 * the setup terminal. Throws NOT_FOUND for unknown agents or attachments.
 */
export function buildTerminalAgentLaunch(
	db: HostDb,
	input: AgentRunInput,
): { fullCommand: string; label: string } {
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config) {
		// Worded for end users (automation run errors show this verbatim), but
		// keep "No host agent config matching" — the desktop matches on it to
		// attach re-select guidance.
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' — the agent may have been removed or this host's agents were reset. Re-select an agent (or use a preset id like "claude").`,
		});
	}
	const launchPresetId = resolveAgentLaunchPresetId(
		config.presetId,
		config.command,
	);
	validateAgentModelSelection(launchPresetId, config.label, input.model);
	validateAgentEffortSelection(
		launchPresetId,
		config.label,
		input.effort,
		input.model,
	);
	validateAgentModeSelection(launchPresetId, config.label, input.mode);
	// Ahead of the per-field validators: passing both is its own mistake, and
	// "this agent cannot fork" would send the caller after the wrong one.
	if (input.resumeSessionId && input.forkSessionId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Choose either resumeSessionId or forkSessionId, not both.",
		});
	}
	validateAgentResumeSelection(config, input.resumeSessionId);
	validateAgentForkSelection(config, input.forkSessionId);
	validateForkSessionIsResolvable(db, config, input);

	const resolvedAttachments: Array<{ attachmentId: string; path: string }> = [];
	for (const attachmentId of input.attachmentIds ?? []) {
		const resolved = resolveAttachmentPath(attachmentId);
		if (!resolved) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Attachment not found: ${attachmentId}`,
			});
		}
		resolvedAttachments.push({ attachmentId, path: resolved.path });
	}

	const prompt = buildAttachmentBlock(input.prompt, resolvedAttachments);
	const modelArgs = buildAgentModelArgs(
		launchPresetId,
		input.model,
		input.effort,
	);
	const effortArgs = buildAgentEffortArgs(
		launchPresetId,
		input.effort,
		input.model,
	);
	const modeArgs = buildAgentModeArgs(launchPresetId, input.mode);
	const command = buildAgentCommandString(
		config,
		prompt,
		[...modelArgs, ...effortArgs, ...modeArgs],
		{
			resumeSessionId: input.resumeSessionId,
			forkSessionId: input.forkSessionId,
		},
	);
	const modelEnv = buildAgentModelEnv(launchPresetId, input.model);
	// Host-default provider account (Usage tab switcher). Per-agent env wins,
	// so a "Claude (work)" agent with its own CLAUDE_CONFIG_DIR stays pinned.
	const accountEnv = resolveDefaultAccountEnv(db, config.presetId);
	return {
		fullCommand: `${envOverlayPrefix({ ...accountEnv, ...config.env, ...modelEnv })}${command}`,
		label: config.label,
	};
}

/**
 * Bind a resumed session's id to its fresh terminal at launch instead of
 * waiting for a hook. Harnesses differ on when they first report a session
 * id: Claude's SessionStart fires at launch, but Codex's TUI fires nothing
 * until the first turn (verified on codex-cli 0.151), so a resumed pane the
 * user has not prompted yet would carry no id — and dying again would leave
 * its restored conversation with no resume candidate. `codex resume <id>`
 * keeps the same rollout id, so the id we launched with is the id to bind.
 * Forks are excluded: they mint a new session id we cannot know here.
 */
export function bindResumedSession(
	ctx: Pick<HostServiceContext, "db" | "terminalAgentStore">,
	input: AgentRunInput,
	terminalId: string,
): void {
	if (!input.resumeSessionId) return;
	const presetId = resolveHostAgentConfig(ctx.db, input.agent)?.presetId;
	if (!presetId || !isBuiltinAgentId(presetId)) return;

	ctx.terminalAgentStore.recordEvent({
		terminalId,
		workspaceId: input.workspaceId,
		eventType: "Attached",
		agentId: presetId,
		agentSessionId: input.resumeSessionId,
		occurredAt: Date.now(),
	});
}

async function runTerminalAgent(
	ctx: Pick<HostServiceContext, "db" | "eventBus" | "terminalAgentStore">,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const { fullCommand, label } = buildTerminalAgentLaunch(ctx.db, input);

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: fullCommand,
	});

	if ("error" in result) {
		throw toTerminalSessionError(result);
	}

	bindResumedSession(ctx, input, result.terminalId);

	return {
		kind: "terminal",
		sessionId: result.terminalId,
		label,
	};
}

export async function runAgentInWorkspace(
	ctx: HostServiceContext,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, input.workspaceId) })
		.sync();
	if (!workspace) {
		// NOT_FOUND (not a 500) so callers like automation dispatch can tell a
		// dead workspace pin apart from a host-side failure.
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${input.workspaceId} not found on this host — it may have been deleted.`,
		});
	}
	// Session workspaces are standalone repos the host itself scaffolded, so
	// agent CLIs can't inherit folder trust from anywhere — pre-trust the
	// folder in the launching agent's own trust store so its first
	// interactive boot skips the trust dialog. Worktree workspaces inherit
	// trust from the main checkout and need nothing.
	if (workspace.projectId === null) {
		const config = resolveHostAgentConfig(ctx.db, input.agent);
		if (config) {
			await seedAgentFolderTrust(ctx.db, workspace.worktreePath, config);
		}
	}
	return runTerminalAgent(ctx, input);
}

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				// Optional: an empty prompt launches the bare agent (the builder
				// drops promptArgs).
				prompt: z.string().default(""),
				attachmentIds: z.array(z.string().uuid()).optional(),
				model: z.string().min(1).optional(),
				effort: z.string().min(1).optional(),
				mode: z.string().min(1).optional(),
				resumeSessionId: z.string().min(1).optional(),
				forkSessionId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
});
