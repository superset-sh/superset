import { spawn } from "node:child_process";
import {
	createWriteStream,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs } from "../../../db/schema";
import {
	type AutomationModelSelection,
	prepareAutomationModelInjection,
} from "../../../model-providers/automation-model-injection";
import {
	getShellBootstrapEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
	stripTerminalRuntimeEnv,
} from "../../../terminal/env";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";

export interface ResolvedHostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
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

function quoteSingleShell(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildArgvCommand(argv: string[]): string {
	return argv.map(quoteSingleShell).join(" ");
}

/**
 * Build a shell command string that runs the resolved agent config with the
 * given prompt. argv transport appends the prompt as the final positional;
 * stdin transport pipes the prompt via a heredoc so the agent can read from
 * fd 0.
 *
 * Empty prompts drop `promptArgs` so codex/opencode/copilot don't get stray
 * prompt-mode flags during promptless launches.
 */
export function buildAgentCommandString(
	config: ResolvedHostAgentConfig,
	prompt: string,
): string {
	const baseArgv = [config.command, ...config.args, ...config.promptArgs];

	if (config.promptTransport === "argv") {
		return buildArgvCommand([...baseArgv, prompt]);
	}

	// stdin: pipe the prompt to the spawned process via heredoc. Delimiter is
	// constructed to avoid collision with any line in the prompt content.
	const baseDelimiter = "SUPERSET_PROMPT";
	let delimiter = baseDelimiter;
	let counter = 0;
	while (prompt.split("\n").some((line) => line === delimiter)) {
		counter += 1;
		delimiter = `${baseDelimiter}_${counter}`;
	}
	return `${buildArgvCommand(baseArgv)} <<'${delimiter}'\n${prompt}\n${delimiter}`;
}

export function buildAgentLaunchCommand(
	config: ResolvedHostAgentConfig,
	prompt: string,
): string {
	return buildAgentCommandString(config, prompt);
}

export function buildAgentLaunchEnv(
	config: ResolvedHostAgentConfig,
	env: Record<string, string> = {},
): Record<string, string> {
	return { ...config.env, ...env };
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
	env?: Record<string, string>;
}

export type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export interface AutomationAgentRunInput {
	runId: string;
	automationId: string;
	agent: string;
	prompt: string;
	attachmentIds?: string[];
	env?: Record<string, string>;
	modelSelection?: AutomationModelSelection;
}

export interface AutomationAgentRunResult {
	kind: "automation";
	sessionId: string;
	label: string;
	runDirectory: string;
	pid: number;
}

export const automationAgentRunInputSchema = z.object({
	runId: z.string().uuid(),
	automationId: z.string().uuid(),
	agent: z.string().min(1),
	prompt: z.string().min(1),
	attachmentIds: z.array(z.string().uuid()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	modelSelection: z
		.object({
			providerId: z.string().min(1),
			modelId: z.string().min(1),
			config: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
});

const SUPERSET_AGENT_ID = "superset";
const SUPERSET_AGENT_LABEL = "Superset";
const AUTOMATION_RUN_OUTPUT_MAX = 120_000;
const TERMINAL_AUTOMATION_RUN_STATUSES = new Set([
	"completed",
	"failed",
	"skipped",
	"dispatch_failed",
	"skipped_offline",
]);

const automationProcesses = new Map<
	string,
	{ pid: number; runDirectory: string; startedAt: Date }
>();

async function resolveAttachmentsAsFiles(
	attachmentIds: string[],
): Promise<Array<{ data: string; mediaType: string; filename?: string }>> {
	return attachmentIds.map((attachmentId) => {
		const resolved = resolveAttachmentPath(attachmentId);
		if (!resolved) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Attachment not found: ${attachmentId}`,
			});
		}
		const bytes = readFileSync(resolved.path);
		const data = `data:${resolved.metadata.mediaType};base64,${bytes.toString("base64")}`;
		return {
			data,
			mediaType: resolved.metadata.mediaType,
			...(resolved.metadata.originalFilename
				? { filename: resolved.metadata.originalFilename }
				: {}),
		};
	});
}

async function runChatAgent(
	ctx: HostServiceContext,
	input: AgentRunInput,
	label: string,
): Promise<AgentRunResult> {
	const sessionId = crypto.randomUUID();
	const files = await resolveAttachmentsAsFiles(input.attachmentIds ?? []);

	await ctx.api.chat.createSession.mutate({
		sessionId,
		v2WorkspaceId: input.workspaceId,
	});

	// Errors surface via `getSnapshot.displayState.errorMessage` when a
	// chat pane attaches.
	void ctx.runtime
		.getChat()
		.then((chat) =>
			chat.sendMessage({
				sessionId,
				workspaceId: input.workspaceId,
				payload: {
					content: input.prompt,
					...(files.length > 0 ? { files } : {}),
				},
			}),
		)
		.catch((error) => {
			console.error(
				`[runChatAgent] sendMessage failed for ${sessionId}:`,
				error,
			);
		});

	return { kind: "chat", sessionId, label };
}

async function runTerminalAgent(
	ctx: { db: HostDb; eventBus: import("../../../events").EventBus },
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const config = resolveHostAgentConfig(ctx.db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}

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
	const fullCommand = buildAgentLaunchCommand(config, prompt);
	const launchEnv = buildAgentLaunchEnv(config, input.env);

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: fullCommand,
		env: launchEnv,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	return {
		kind: "terminal",
		sessionId: result.terminalId,
		label: config.label,
	};
}

function snapshotStringEnv(
	baseEnv: NodeJS.ProcessEnv | Record<string, string> = process.env,
): Record<string, string> {
	const snapshot: Record<string, string> = {};
	for (const [key, value] of Object.entries(baseEnv)) {
		if (typeof value === "string") snapshot[key] = value;
	}
	return snapshot;
}

function getAutomationRunnerBaseEnv(): Record<string, string> {
	try {
		return getTerminalBaseEnv();
	} catch {
		return stripTerminalRuntimeEnv(snapshotStringEnv(process.env));
	}
}

function getSupersetHomeDirForShell(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
}

function getAutomationRootDirectory(): string {
	const override = process.env.SUPERSET_AUTOMATION_RUNS_DIR?.trim();
	if (override) return override;

	const suffix = process.env.NODE_ENV === "development" ? "dev" : "";
	return suffix
		? join(homedir(), ".superset", suffix, "automations")
		: join(homedir(), ".superset", "automations");
}

export function getAutomationDirectory(automationId: string): string {
	return join(getAutomationRootDirectory(), automationId);
}

export function getAutomationExecutionDirectory(automationId: string): string {
	return getAutomationDirectory(automationId);
}

function getAutomationRunArtifactPaths(args: {
	automationDirectory: string;
	runId: string;
}): {
	runsDirectory: string;
	promptPath: string;
	metadataPath: string;
	stdoutPath: string;
	stderrPath: string;
} {
	const runsDirectory = join(args.automationDirectory, "runs");
	const runPrefix = join(runsDirectory, args.runId);
	return {
		runsDirectory,
		promptPath: `${runPrefix}.prompt.md`,
		metadataPath: `${runPrefix}.metadata.json`,
		stdoutPath: `${runPrefix}.stdout.log`,
		stderrPath: `${runPrefix}.stderr.log`,
	};
}

function buildAutomationRunnerEnv(args: {
	config: ResolvedHostAgentConfig;
	runDirectory: string;
	extraEnv?: Record<string, string>;
}): Record<string, string> {
	const baseEnv = getAutomationRunnerBaseEnv();
	const supersetHomeDir = getSupersetHomeDirForShell();
	const shell = resolveLaunchShell(baseEnv);
	const env = stripTerminalRuntimeEnv(baseEnv);

	Object.assign(
		env,
		getShellBootstrapEnv({
			shell,
			baseEnv,
			supersetHomeDir,
		}),
	);

	env.TERM = env.TERM || "xterm-256color";
	env.COLORTERM = env.COLORTERM || "truecolor";
	env.PWD = args.runDirectory;
	env.SUPERSET_HOME_DIR = supersetHomeDir;
	env.SUPERSET_ENV =
		process.env.NODE_ENV === "development" ? "development" : "production";
	env.SUPERSET_AUTOMATION_RUN_DIR = args.runDirectory;

	return {
		...env,
		...buildAgentLaunchEnv(args.config, args.extraEnv),
	};
}

function buildAutomationShellLaunch(command: string): {
	shell: string;
	args: string[];
} {
	const baseEnv = getAutomationRunnerBaseEnv();
	const supersetHomeDir = getSupersetHomeDirForShell();
	const shell = resolveLaunchShell(baseEnv);
	return {
		shell,
		args: [
			...getShellLaunchArgs({
				shell,
				supersetHomeDir,
			}),
			"-c",
			command,
		],
	};
}

function readFileTail(path: string, maxChars: number): string {
	try {
		const content = readFileSync(path, "utf-8");
		if (content.length <= maxChars) return content;
		return content.slice(content.length - maxChars);
	} catch {
		return "";
	}
}

function buildFallbackResultMarkdown(args: {
	title: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	runDirectory: string;
}): string {
	const sections = [
		`# ${args.title}`,
		"",
		`Run directory: \`${args.runDirectory}\``,
		`Exit code: \`${args.exitCode ?? "-"}\``,
		`Signal: \`${args.signal ?? "-"}\``,
	];

	if (args.stdout.trim()) {
		sections.push("", "## stdout", "", "```text", args.stdout.trim(), "```");
	}
	if (args.stderr.trim()) {
		sections.push("", "## stderr", "", "```text", args.stderr.trim(), "```");
	}
	if (!args.stdout.trim() && !args.stderr.trim()) {
		sections.push("", "The agent process exited without writing output.");
	}

	return sections.join("\n").slice(0, 190_000);
}

async function finalizeAutomationProcess(args: {
	ctx: HostServiceContext;
	runId: string;
	runDirectory: string;
	stdoutPath: string;
	stderrPath: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
}): Promise<void> {
	automationProcesses.delete(args.runId);

	const run = await args.ctx.api.automation.getRun.query({
		runId: args.runId,
	});
	if (TERMINAL_AUTOMATION_RUN_STATUSES.has(run.status)) return;

	const stdout = readFileTail(args.stdoutPath, AUTOMATION_RUN_OUTPUT_MAX);
	const stderr = readFileTail(args.stderrPath, AUTOMATION_RUN_OUTPUT_MAX);
	const exitedCleanly = args.exitCode === 0 && !args.signal;

	if (exitedCleanly) {
		await args.ctx.api.automation.completeRun.mutate({
			runId: args.runId,
			resultMarkdown: buildFallbackResultMarkdown({
				title: "Automation completed",
				exitCode: args.exitCode,
				signal: args.signal,
				stdout,
				stderr,
				runDirectory: args.runDirectory,
			}),
			resultSummary: "Automation completed",
		});
		return;
	}

	await args.ctx.api.automation.failRun.mutate({
		runId: args.runId,
		failureReason: args.signal
			? `Agent exited by signal ${args.signal}`
			: `Agent exited with code ${args.exitCode ?? "unknown"}`,
		resultMarkdown: buildFallbackResultMarkdown({
			title: "Automation failed",
			exitCode: args.exitCode,
			signal: args.signal,
			stdout,
			stderr,
			runDirectory: args.runDirectory,
		}),
		resultSummary: "Automation failed",
	});
}

export async function runAutomationAgent(
	ctx: HostServiceContext,
	input: AutomationAgentRunInput,
): Promise<AutomationAgentRunResult> {
	if (input.agent === SUPERSET_AGENT_ID) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Superset chat agent requires a workspace and is not supported for background automations yet. Choose Claude, Codex, OpenCode, Gemini, or another host agent.",
		});
	}

	if (automationProcesses.has(input.runId)) {
		const existing = automationProcesses.get(input.runId);
		if (existing) {
			return {
				kind: "automation",
				sessionId: input.runId,
				label: "Automation",
				runDirectory: existing.runDirectory,
				pid: existing.pid,
			};
		}
	}

	const config = resolveHostAgentConfig(ctx.db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}

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

	const runDirectory = getAutomationExecutionDirectory(input.automationId);
	mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
	const artifactPaths = getAutomationRunArtifactPaths({
		automationDirectory: runDirectory,
		runId: input.runId,
	});
	mkdirSync(artifactPaths.runsDirectory, { recursive: true, mode: 0o700 });

	const prompt = buildAttachmentBlock(input.prompt, resolvedAttachments);
	writeFileSync(artifactPaths.promptPath, prompt, { mode: 0o600 });

	const modelInjection = prepareAutomationModelInjection({
		db: ctx.db,
		config,
		automationId: input.automationId,
		runDirectory,
		hostServiceBaseUrl: ctx.hostServiceBaseUrl,
		selection: input.modelSelection,
	});

	writeFileSync(
		artifactPaths.metadataPath,
		JSON.stringify(
			{
				runId: input.runId,
				automationId: input.automationId,
				agent: input.agent,
				startedAt: new Date().toISOString(),
				model:
					modelInjection && input.modelSelection
						? {
								family: modelInjection.family,
								providerId: input.modelSelection.providerId,
								modelId: input.modelSelection.modelId,
								configPath: modelInjection.configPath,
							}
						: null,
			},
			null,
			2,
		),
		{ mode: 0o600 },
	);

	const command = buildAgentLaunchCommand(config, prompt);
	const launch = buildAutomationShellLaunch(command);
	const env = buildAutomationRunnerEnv({
		config,
		runDirectory,
		extraEnv: {
			...(input.env ?? {}),
			...(modelInjection?.env ?? {}),
		},
	});
	const stdoutPath = artifactPaths.stdoutPath;
	const stderrPath = artifactPaths.stderrPath;
	const stdoutStream = createWriteStream(stdoutPath, {
		flags: "a",
		mode: 0o600,
	});
	const stderrStream = createWriteStream(stderrPath, {
		flags: "a",
		mode: 0o600,
	});

	const child = spawn(launch.shell, launch.args, {
		cwd: runDirectory,
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	child.stdout?.pipe(stdoutStream);
	child.stderr?.pipe(stderrStream);

	automationProcesses.set(input.runId, {
		pid: child.pid ?? -1,
		runDirectory,
		startedAt: new Date(),
	});

	let finalized = false;
	const finalize = (exitCode: number | null, signal: NodeJS.Signals | null) => {
		if (finalized) return;
		finalized = true;
		stdoutStream.end();
		stderrStream.end();
		void finalizeAutomationProcess({
			ctx,
			runId: input.runId,
			runDirectory,
			stdoutPath,
			stderrPath,
			exitCode,
			signal,
		}).catch((error) => {
			console.error("[automation-runner] failed to finalize run", {
				runId: input.runId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	};

	child.on("error", (error) => {
		stderrStream.write(`${error.message}\n`);
		finalize(1, null);
	});
	child.on("close", (code, signal) => {
		finalize(code, signal);
	});

	return {
		kind: "automation",
		sessionId: input.runId,
		label: config.label,
		runDirectory,
		pid: child.pid ?? -1,
	};
}

export async function runAgentInWorkspace(
	ctx: HostServiceContext,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	if (input.agent === SUPERSET_AGENT_ID) {
		return runChatAgent(ctx, input, SUPERSET_AGENT_LABEL);
	}
	return runTerminalAgent(ctx, input);
}

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				prompt: z.string().min(1),
				attachmentIds: z.array(z.string().uuid()).optional(),
				env: z.record(z.string(), z.string()).optional(),
				modelSelection: z
					.object({
						providerId: z.string().min(1),
						modelId: z.string().min(1),
						config: z.record(z.string(), z.unknown()).optional(),
					})
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
	runAutomation: protectedProcedure
		.input(automationAgentRunInputSchema)
		.mutation(async ({ ctx, input }) => runAutomationAgent(ctx, input)),
});
