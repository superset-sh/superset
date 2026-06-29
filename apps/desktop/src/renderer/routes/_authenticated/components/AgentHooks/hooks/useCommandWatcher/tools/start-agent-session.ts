import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import {
	chatLaunchConfigSchema,
	normalizeAgentLaunchRequest,
	STARTABLE_AGENT_TYPES,
} from "@superset/shared/agent-launch";
import {
	buildFileCommandFromAgentConfig,
	renderTaskPromptTemplate,
	type ResolvedAgentConfig,
} from "shared/utils/agent-settings";
import {
	launchAgentSession,
	queueAgentSessionLaunch,
} from "renderer/lib/agent-session-orchestrator";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	workspaceId: z.string(),
	command: z.string().optional(),
	name: z.string().optional(),
	paneId: z.string().optional(),
	openChatPane: z.boolean().optional(),
	chatLaunchConfig: chatLaunchConfigSchema.partial().optional(),
	idempotencyKey: z.string().optional(),
	agentType: z.enum(STARTABLE_AGENT_TYPES).optional(),
	request: z.unknown().optional(),
});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const workspaces = ctx.getWorkspaces();
	if (!workspaces || workspaces.length === 0) {
		return { success: false, error: "No workspaces available" };
	}

	const workspace = workspaces.find((ws) => ws.id === params.workspaceId);
	if (!workspace) {
		return {
			success: false,
			error: `Workspace not found: ${params.workspaceId}`,
		};
	}

	try {
		const fallbackRequest = {
			workspaceId: params.workspaceId,
			command: params.command,
			name: params.name,
			paneId: params.paneId,
			openChatPane: params.openChatPane,
			chatLaunchConfig: params.chatLaunchConfig,
			idempotencyKey: params.idempotencyKey,
			agentType: params.agentType,
			source: "command-watcher",
		};
		const mergedRequest =
			params.request && typeof params.request === "object"
				? { ...fallbackRequest, ...(params.request as Record<string, unknown>) }
				: fallbackRequest;
		const request = normalizeAgentLaunchRequest(mergedRequest);

		// Rebuild terminal command and prompt using device-local agent settings.
		// The MCP server sends a fallback command built from hardcoded builtins, but
		// the user may have overridden agent settings on this device.
		if (
			request.kind === "terminal" &&
			request.terminal.taskPromptFileName &&
			request.agentType
		) {
			try {
				const presets =
					await electronTrpcClient.settings.getAgentPresets.query();
				const agentId = request.agentType as AgentDefinitionId;
				const config = presets.find(
					(p: ResolvedAgentConfig) => p.id === agentId,
				);
				if (config && !config.enabled) {
					return {
						success: false,
						error: `Agent "${request.agentType}" is disabled on this device`,
					};
				}
				if (config && config.kind === "terminal") {
					const rebuilt = buildFileCommandFromAgentConfig({
						filePath: `.superset/${request.terminal.taskPromptFileName}`,
						config,
					});
					if (rebuilt) {
						request.terminal.command = rebuilt;
					}
					// Re-render prompt with local template when task data is available
					if (request.terminal.taskInput) {
						request.terminal.taskPromptContent =
							renderTaskPromptTemplate(
								config.taskPromptTemplate,
								request.terminal.taskInput,
							);
					}
				}
			} catch {
				// Fall back to the MCP-provided command
			}
		}

		if (request.workspaceId !== params.workspaceId) {
			return {
				success: false,
				error: `Workspace mismatch: ${request.workspaceId} (expected ${params.workspaceId})`,
			};
		}

		const hasExplicitPaneTarget =
			request.kind === "terminal"
				? Boolean(request.terminal.paneId)
				: Boolean(request.chat.paneId);

		const launchResult = hasExplicitPaneTarget
			? await launchAgentSession(request, {
					source: "command-watcher",
					createOrAttach: (input) =>
						ctx.terminalCreateOrAttach.mutateAsync(input),
					write: (input) => ctx.terminalWrite.mutateAsync(input),
				})
			: queueAgentSessionLaunch({
					request,
					projectId: workspace.projectId,
				});

		if (launchResult.status === "failed") {
			return {
				success: false,
				error: launchResult.error ?? "Failed to start agent session",
			};
		}

		return {
			success: true,
			data: {
				workspaceId: launchResult.workspaceId,
				branch: workspace.branch,
				tabId: launchResult.tabId,
				paneId: launchResult.paneId,
				sessionId: launchResult.sessionId,
				status: launchResult.status,
			},
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to start agent session",
		};
	}
}

export const startAgentSession: ToolDefinition<typeof schema> = {
	name: "start_agent_session",
	schema,
	execute,
};

export const startAgentSessionWithPrompt: ToolDefinition<typeof schema> = {
	name: "start_agent_session_with_prompt",
	schema,
	execute,
};
