import {
	type AgentCapabilityTrait,
	type AgentModelOption,
	buildAgentContextWindowEnv,
	buildAgentEffortArgs,
	buildAgentModeArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
	buildAgentRuntimeTraitArgs,
	getAgentContextWindowSupport,
	getAgentModelSupport,
	getAgentModeSupport,
	getAgentSpeedSupport,
	resolveAgentEffortSupport,
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
import type { AgentCapabilitySnapshot } from "../../../agent-capabilities/agent-capabilities";
import { readPersistedCapabilitySnapshots } from "../../../agent-capabilities/capability-refresh-service";
import type { HostDb } from "../../../db";
import { hostAgentConfigs, workspaces } from "../../../db/schema";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";
import {
	parseAgentArgv,
	parseAgentEnv,
	parsePromptTransport,
} from "../settings/agent-config-parsers";
import { toTerminalSessionError } from "../terminal/errors";

interface ResolvedHostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	capabilityRevision: number;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	resumeArgs: string[];
	env: Record<string, string>;
}

function rowToConfig(
	row: typeof hostAgentConfigs.$inferSelect,
): ResolvedHostAgentConfig {
	return {
		id: row.id,
		presetId: row.presetId,
		label: row.label,
		command: row.command,
		capabilityRevision: row.capabilityRevision,
		args: parseAgentArgv(row.argsJson),
		promptTransport: parsePromptTransport(row.promptTransport),
		promptArgs: parseAgentArgv(row.promptArgsJson),
		resumeArgs: parseAgentArgv(row.resumeArgsJson),
		env: parseAgentEnv(row.envJson),
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
	mode?: string;
	speed?: string;
	contextWindow?: string;
	/** Session id of a previous run of this agent to restore (e.g. a killed
	 * session's `agentSessionId`). The prompt may be empty when resuming. */
	resumeSessionId?: string;
}

export type AgentRunResult = {
	kind: "terminal";
	sessionId: string;
	label: string;
};

export interface AgentLaunchSelection {
	model?: string;
	effort?: string;
	mode?: string;
	speed?: string;
	contextWindow?: string;
}

const validatedLaunchSelectionBrand = Symbol("ValidatedLaunchSelection");

export interface ValidatedLaunchSelection {
	readonly [validatedLaunchSelectionBrand]: true;
	readonly agentId: string;
	readonly presetId: string;
	readonly configRevision: number;
	readonly selection: AgentLaunchSelection;
	readonly allowedModelIds: readonly string[];
	readonly modelSource: AgentCapabilitySnapshot["modelSource"];
	readonly reasoning: AgentCapabilityTrait<AgentModelOption> | undefined;
}

export type AgentLaunchInput = Pick<
	AgentRunInput,
	"agent" | "model" | "effort" | "mode" | "speed" | "contextWindow"
>;

function capabilitySelectionError(
	code: "BAD_REQUEST" | "PRECONDITION_FAILED",
	message: string,
): TRPCError {
	return new TRPCError({
		code,
		message,
	});
}

function launchSelectionOf(input: AgentLaunchSelection): AgentLaunchSelection {
	const selection: AgentLaunchSelection = {};
	if (input.model) selection.model = input.model;
	if (input.effort) selection.effort = input.effort;
	if (input.mode) selection.mode = input.mode;
	if (input.speed) selection.speed = input.speed;
	if (input.contextWindow) selection.contextWindow = input.contextWindow;
	return selection;
}

function sameLaunchSelection(
	left: AgentLaunchSelection,
	right: AgentLaunchSelection,
): boolean {
	const a = launchSelectionOf(left);
	const b = launchSelectionOf(right);
	return (
		a.model === b.model &&
		a.effort === b.effort &&
		a.mode === b.mode &&
		a.speed === b.speed &&
		a.contextWindow === b.contextWindow
	);
}

export function resolveAllowedLaunchModelIds(
	presetId: string,
	capability: Pick<AgentCapabilitySnapshot, "modelSource" | "models">,
): string[] {
	if (capability.modelSource === "runtime") {
		return capability.models.map((model) => model.id);
	}
	const staticIds =
		getAgentModelSupport(presetId)?.models.map((model) => model.id) ?? [];
	const snapshotIds = capability.models.map((model) => model.id);
	return [...new Set([...staticIds, ...snapshotIds])];
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
	reasoning?: AgentCapabilityTrait<AgentModelOption>,
): void {
	if (!effort) return;

	const support = resolveAgentEffortSupport(presetId, model, reasoning);
	if (!support) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			`${label} does not support a reasoning effort override. Omit effort to use the agent default.`,
		);
	}

	if (!support.efforts.some((option) => option.id === effort)) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			`Unsupported reasoning effort "${effort}" for ${label}. Choose one of: ${support.efforts.map((option) => option.id).join(", ")}.`,
		);
	}
}

export function validateAgentModelSelection(
	presetId: string,
	label: string,
	model: string | undefined,
	capability: Pick<AgentCapabilitySnapshot, "modelSource" | "models">,
): void {
	if (!model) return;
	const transport = getAgentModelSupport(presetId);
	if (!transport?.modelFlag && !transport?.modelEnv) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			`${label} does not support a model override. Omit model to use the agent default.`,
		);
	}
	const allowed = resolveAllowedLaunchModelIds(presetId, capability);
	if (!allowed.includes(model)) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			`Model "${model}" is not available for ${label}.`,
		);
	}
}

export function validateAgentModeSelection(
	presetId: string,
	label: string,
	mode: string | undefined,
): void {
	if (!mode) return;
	const support = getAgentModeSupport(presetId);
	if (!support?.modes.some((option) => option.id === mode)) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			support
				? `Unsupported mode "${mode}" for ${label}. Choose one of: ${support.modes.map((option) => option.id).join(", ")}.`
				: `${label} does not support a mode override. Omit mode to use the agent default.`,
		);
	}
}

export function validateAgentSpeedSelection(
	presetId: string,
	label: string,
	speed: string | undefined,
	model?: string,
): void {
	if (!speed) return;
	const support = getAgentSpeedSupport(presetId, model);
	if (!support?.speeds.some((option) => option.id === speed)) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			support
				? `Unsupported speed "${speed}" for ${label}. Choose one of: ${support.speeds.map((option) => option.id).join(", ")}.`
				: `${label} does not support a speed override for the selected model. Omit speed to use the agent default.`,
		);
	}
}

export function validateAgentContextWindowSelection(
	presetId: string,
	label: string,
	contextWindow: string | undefined,
	model?: string,
): void {
	if (!contextWindow) return;
	const support = getAgentContextWindowSupport(presetId, model);
	if (!support?.contextWindows.some((option) => option.id === contextWindow)) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			support
				? `Unsupported context window "${contextWindow}" for ${label}. Choose one of: ${support.contextWindows.map((option) => option.id).join(", ")}.`
				: `${label} does not support a context window override for the selected model. Omit contextWindow to use the agent default.`,
		);
	}
}

function validateExplicitLaunchSelection(
	presetId: string,
	label: string,
	selection: AgentLaunchSelection,
	capability: Pick<AgentCapabilitySnapshot, "modelSource" | "models">,
	reasoning?: AgentCapabilityTrait<AgentModelOption>,
): void {
	validateAgentModelSelection(presetId, label, selection.model, capability);
	validateAgentEffortSelection(
		presetId,
		label,
		selection.effort,
		selection.model,
		reasoning,
	);
	validateAgentModeSelection(presetId, label, selection.mode);
	validateAgentSpeedSelection(
		presetId,
		label,
		selection.speed,
		selection.model,
	);
	validateAgentContextWindowSelection(
		presetId,
		label,
		selection.contextWindow,
		selection.model,
	);
}

function issueValidatedLaunchSelection(
	config: Pick<
		ResolvedHostAgentConfig,
		"id" | "presetId" | "capabilityRevision" | "label"
	>,
	selection: AgentLaunchSelection,
	capability: Pick<AgentCapabilitySnapshot, "modelSource" | "models">,
): ValidatedLaunchSelection {
	const runtimeModel = capability.models.find(
		(model) => model.id === selection.model,
	);
	const reasoning =
		capability.modelSource === "runtime" ? runtimeModel?.reasoning : undefined;
	validateExplicitLaunchSelection(
		config.presetId,
		config.label,
		selection,
		capability,
		reasoning,
	);
	return {
		[validatedLaunchSelectionBrand]: true,
		agentId: config.id,
		presetId: config.presetId,
		configRevision: config.capabilityRevision,
		selection: launchSelectionOf(selection),
		allowedModelIds: resolveAllowedLaunchModelIds(config.presetId, capability),
		modelSource: capability.modelSource,
		reasoning,
	};
}

function assertValidatedLaunchSelectionMatches(
	config: Pick<
		ResolvedHostAgentConfig,
		"id" | "presetId" | "capabilityRevision" | "label"
	>,
	input: AgentLaunchSelection,
	validated: ValidatedLaunchSelection,
): void {
	if (
		validated.agentId !== config.id ||
		validated.presetId !== config.presetId ||
		validated.configRevision !== config.capabilityRevision
	) {
		throw capabilitySelectionError(
			"PRECONDITION_FAILED",
			`${config.label} changed while its capabilities were being validated. Retry the launch.`,
		);
	}
	if (!sameLaunchSelection(validated.selection, input)) {
		throw capabilitySelectionError(
			"BAD_REQUEST",
			`${config.label} validated selection does not match the requested launch selection.`,
		);
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
export async function validateAgentLaunchSelection(
	db: HostDb,
	input: AgentLaunchInput,
): Promise<ValidatedLaunchSelection> {
	const selection = launchSelectionOf(input);
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}
	const view = readPersistedCapabilitySnapshots(db).find(
		(capability) => capability.agentId === config.id,
	);
	const inventory =
		view?.inventory?.agentId === config.id &&
		view.inventory.presetId === config.presetId &&
		view.inventory.configRevision === config.capabilityRevision
			? view.inventory
			: null;
	const capability: Pick<AgentCapabilitySnapshot, "modelSource" | "models"> = {
		modelSource:
			inventory?.modelSource === "runtime"
				? "runtime"
				: inventory
					? "fallback"
					: "none",
		models: inventory?.models ?? [],
	};
	return issueValidatedLaunchSelection(config, selection, capability);
}

/**
 * Resolve a terminal agent launch to the shell command that runs it, without
 * creating a terminal. Used by `runTerminalAgent` and by the workspace-create
 * wait-for-setup gate, which chains this command behind the setup commands in
 * the setup terminal. Throws NOT_FOUND for unknown agents or attachments.
 */
export async function buildValidatedTerminalAgentLaunch(
	db: HostDb,
	input: AgentRunInput,
): Promise<{ fullCommand: string; label: string }> {
	const validated = await validateAgentLaunchSelection(db, input);
	return buildTerminalAgentLaunch(db, input, validated);
}

const LAUNCH_COMMAND_WORKSPACE_PLACEHOLDER =
	"00000000-0000-0000-0000-000000000000";

/**
 * Validate a host agent and return its trusted command without creating a
 * terminal. Preset execution uses this so
 * sequential / active-terminal writes can keep the current pane.
 */
export async function resolveValidatedLaunchCommand(
	db: HostDb,
	input: AgentLaunchInput & { prompt?: string },
): Promise<{ command: string; label: string }> {
	const { fullCommand, label } = await buildValidatedTerminalAgentLaunch(db, {
		workspaceId: LAUNCH_COMMAND_WORKSPACE_PLACEHOLDER,
		agent: input.agent,
		prompt: input.prompt ?? "",
		model: input.model,
		effort: input.effort,
		mode: input.mode,
		speed: input.speed,
		contextWindow: input.contextWindow,
	});
	return { command: fullCommand, label };
}

export function buildTerminalAgentLaunch(
	db: HostDb,
	input: AgentRunInput,
	validated: ValidatedLaunchSelection,
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
	assertValidatedLaunchSelectionMatches(config, input, validated);
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
	const modelArgs = buildAgentModelArgs(
		config.presetId,
		input.model,
		input.contextWindow,
		validated.allowedModelIds,
	);
	const effortArgs = buildAgentEffortArgs(
		config.presetId,
		input.effort,
		input.model,
		validated.reasoning?.state === "supported"
			? {
					defaultEffortId: validated.reasoning.defaultId,
					efforts: validated.reasoning.options,
				}
			: validated.reasoning?.state === "unsupported"
				? { efforts: [] }
				: undefined,
	);
	const runtimeTraitArgs = buildAgentRuntimeTraitArgs(config.presetId, {
		model: input.model,
		effort: input.effort,
		speed: input.speed,
	});
	const modeArgs = buildAgentModeArgs(config.presetId, input.mode);
	const command = buildAgentCommandString(
		config,
		prompt,
		[...modelArgs, ...effortArgs, ...modeArgs, ...runtimeTraitArgs],
		{ resumeSessionId: input.resumeSessionId },
	);
	const modelEnv = buildAgentModelEnv(
		config.presetId,
		input.model,
		validated.allowedModelIds,
	);
	const contextWindowEnv = buildAgentContextWindowEnv(
		config.presetId,
		input.model,
		input.contextWindow,
	);
	const launchEnv = {
		...config.env,
		...modelEnv,
	};
	if (contextWindowEnv.CLAUDE_CODE_DISABLE_1M_CONTEXT !== undefined) {
		launchEnv.CLAUDE_CODE_DISABLE_1M_CONTEXT =
			contextWindowEnv.CLAUDE_CODE_DISABLE_1M_CONTEXT;
	}
	return {
		fullCommand: `${envOverlayPrefix(launchEnv)}${command}`,
		label: config.label,
	};
}

async function runTerminalAgent(
	ctx: Pick<HostServiceContext, "db" | "eventBus">,
	input: AgentRunInput,
	validated: ValidatedLaunchSelection,
): Promise<AgentRunResult> {
	const { fullCommand, label } = buildTerminalAgentLaunch(
		ctx.db,
		input,
		validated,
	);

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
	const validated = await validateAgentLaunchSelection(ctx.db, input);
	return runTerminalAgent(ctx, input, validated);
}

const agentLaunchSelectionInput = {
	agent: z.string().min(1),
	model: z.string().min(1).optional(),
	effort: z.string().min(1).optional(),
	mode: z.string().min(1).optional(),
	speed: z.string().min(1).optional(),
	contextWindow: z.string().min(1).optional(),
};

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				// Optional: an empty prompt launches the bare agent (the builder
				// drops promptArgs).
				prompt: z.string().default(""),
				attachmentIds: z.array(z.string().uuid()).optional(),
				resumeSessionId: z.string().min(1).optional(),
				...agentLaunchSelectionInput,
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
	resolveLaunchCommand: protectedProcedure
		.input(
			z.object({
				prompt: z.string().default(""),
				...agentLaunchSelectionInput,
			}),
		)
		.mutation(async ({ ctx, input }) =>
			resolveValidatedLaunchCommand(ctx.db, input),
		),
});
