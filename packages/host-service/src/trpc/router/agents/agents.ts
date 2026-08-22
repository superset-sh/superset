import {
	buildAgentEffortArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
	getAgentEffortSupport,
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
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";
import { toTerminalSessionError } from "../terminal/errors";
import { resolveDefaultAccountEnv } from "../usage/default-account";

interface ResolvedHostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	resumeArgs: string[];
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
	options: { resumeSessionId?: string; randomId?: string } = {},
): string {
	const randomId = options.randomId ?? crypto.randomUUID();
	const prompt = sanitizePromptForPty(rawPrompt);
	const resumeArgv = options.resumeSessionId
		? [...config.resumeArgs, sanitizePromptForPty(options.resumeSessionId)]
		: [];
	const baseArgv = [
		config.command,
		...config.args,
		...modelArgs,
		...resumeArgv,
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
	/** Session id of a previous run of this agent to restore (e.g. a killed
	 * session's `agentSessionId`). The prompt may be empty when resuming. */
	resumeSessionId?: string;
}

export type AgentRunResult = {
	kind: "terminal";
	sessionId: string;
	label: string;
};

/**
 * Validate an explicit effort override before launch. Omitting effort always
 * delegates to the underlying agent's own default.
 */
export function validateAgentEffortSelection(
	presetId: string,
	label: string,
	effort: string | undefined,
): void {
	if (!effort) return;

	const support = getAgentEffortSupport(presetId);
	if (!support) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} does not support a reasoning effort override. Omit effort to use the agent default.`,
		});
	}

	if (!support.efforts.some((option) => option.id === effort)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unsupported reasoning effort "${effort}" for ${label}. Choose one of: ${support.efforts.map((option) => option.id).join(", ")}.`,
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

/**
 * Preflight a host-scoped launch before any larger workflow (such as
 * workspace creation) performs side effects.
 */
export function validateAgentLaunchEffort(
	db: HostDb,
	input: Pick<AgentRunInput, "agent" | "effort">,
): void {
	if (!input.effort) return;

	const config = resolveHostAgentConfig(db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}
	validateAgentEffortSelection(config.presetId, config.label, input.effort);
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
	validateAgentEffortSelection(config.presetId, config.label, input.effort);
	validateAgentResumeSelection(config, input.resumeSessionId);

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
	const modelArgs = buildAgentModelArgs(config.presetId, input.model);
	const effortArgs = buildAgentEffortArgs(config.presetId, input.effort);
	const command = buildAgentCommandString(
		config,
		prompt,
		[...modelArgs, ...effortArgs],
		{ resumeSessionId: input.resumeSessionId },
	);
	const modelEnv = buildAgentModelEnv(config.presetId, input.model);
	// Host-default provider account (Usage tab switcher). Per-agent env wins,
	// so a "Claude (work)" agent with its own CLAUDE_CONFIG_DIR stays pinned.
	const accountEnv = resolveDefaultAccountEnv(db, config.presetId);
	return {
		fullCommand: `${envOverlayPrefix({ ...accountEnv, ...config.env, ...modelEnv })}${command}`,
		label: config.label,
	};
}

async function runTerminalAgent(
	ctx: { db: HostDb; eventBus: import("../../../events").EventBus },
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
				resumeSessionId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
});
