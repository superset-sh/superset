import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs } from "../../../db/schema";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";

interface ResolvedHostAgentConfig {
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

function envOverlayPrefix(env: Record<string, string>): string {
	const entries = Object.entries(env);
	if (entries.length === 0) return "";
	const assignments = entries
		.map(([key, value]) => `${key}=${quoteSingleShell(value)}`)
		.join(" ");
	return `${assignments} `;
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
}

export interface AgentRunResult {
	sessionId: string;
	label: string;
}

/**
 * Launch an agent against a workspace. Pure function over (db, eventBus,
 * input) so `workspaces.create` can invoke it directly for the `agents`
 * sugar without going back through tRPC.
 */
export async function runAgentInWorkspace(
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
	const command = buildAgentCommandString(config, prompt);
	const fullCommand = `${envOverlayPrefix(config.env)}${command}`;

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: fullCommand,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	return {
		sessionId: result.terminalId,
		label: config.label,
	};
}

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				prompt: z.string().min(1),
				attachmentIds: z.array(z.string().uuid()).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
});
