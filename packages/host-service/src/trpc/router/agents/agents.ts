import { readFileSync } from "node:fs";
import {
	buildAgentEffortArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
} from "@superset/shared/agent-models";
import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs, workspaces } from "../../../db/schema";
import {
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";
import { waitForAgentLaunch, withPreparedAgentLaunch } from "./agent-launch";
import { buildAttachmentBlock } from "./attachment-prompt";

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

export interface AgentRunInput {
	workspaceId: string;
	agent: string;
	prompt: string;
	attachmentIds?: string[];
	model?: string;
	effort?: string;
}

export type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

const SUPERSET_AGENT_ID = "superset";
const SUPERSET_AGENT_LABEL = "Superset";

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
	void ctx.runtime.chat
		.sendMessage({
			sessionId,
			workspaceId: input.workspaceId,
			payload: {
				content: input.prompt,
				...(files.length > 0 ? { files } : {}),
			},
			...(input.model ? { metadata: { model: input.model } } : {}),
		})
		.catch((error) => {
			console.error(
				`[runChatAgent] sendMessage failed for ${sessionId}:`,
				error,
			);
		});

	return { kind: "chat", sessionId, label };
}

async function runTerminalAgent(
	ctx: HostServiceContext,
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

	const prompt = sanitizePromptForPty(
		buildAttachmentBlock(input.prompt, resolvedAttachments),
	);
	const modelArgs = buildAgentModelArgs(config.presetId, input.model);
	const effortArgs = buildAgentEffortArgs(config.presetId, input.effort);
	const modelEnv = buildAgentModelEnv(config.presetId, input.model);
	return withPreparedAgentLaunch(
		{
			command: config.command,
			args: [...config.args, ...modelArgs, ...effortArgs],
			promptArgs: config.promptArgs,
			promptTransport: config.promptTransport,
			prompt,
			env: { ...config.env, ...modelEnv },
		},
		async (launch) => {
			const terminalId = crypto.randomUUID();
			const result = await createTerminalSessionInternal({
				terminalId,
				workspaceId: input.workspaceId,
				db: ctx.db,
				eventBus: ctx.eventBus,
				initialCommand: launch.initialCommand,
			});

			if ("error" in result) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: result.error,
				});
			}

			try {
				await waitForAgentLaunch(launch);
			} catch (error) {
				await disposeSessionAndWait(terminalId, ctx.db).catch(() => undefined);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Agent failed to start",
					cause: error,
				});
			}

			return {
				kind: "terminal" as const,
				sessionId: result.terminalId,
				label: config.label,
			};
		},
	);
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
				model: z.string().min(1).optional(),
				effort: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),
});
