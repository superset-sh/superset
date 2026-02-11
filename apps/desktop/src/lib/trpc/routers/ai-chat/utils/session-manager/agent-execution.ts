import { join } from "node:path";
import {
	createPermissionRequest,
	executeAgent,
	resolvePendingPermission,
} from "@superset/agent";
import { app } from "electron";
import { buildClaudeEnv } from "../auth";
import type { SessionStore } from "../session-store";
import type { PermissionRequestEvent } from "./session-events";
import type { ActiveSession } from "./session-types";

function getClaudeBinaryPath(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "bin", "claude");
	}
	const platform = process.platform;
	const arch = process.arch;
	return join(
		app.getAppPath(),
		"resources",
		"bin",
		`${platform}-${arch}`,
		"claude",
	);
}

export interface ResolvePermissionInput {
	sessionId: string;
	toolUseId: string;
	approved: boolean;
	updatedInput?: Record<string, unknown>;
}

export interface ExecuteAgentInput {
	session: ActiveSession;
	sessionId: string;
	prompt: string;
	abortController: AbortController;
	onChunk: (chunk: unknown) => void;
}

interface AgentExecutionDeps {
	store: SessionStore;
	emitPermissionRequest: (event: PermissionRequestEvent) => void;
}

export class AgentExecution {
	constructor(private readonly deps: AgentExecutionDeps) {}

	async execute({
		session,
		sessionId,
		prompt,
		abortController,
		onChunk,
	}: ExecuteAgentInput): Promise<void> {
		const agentEnv = buildClaudeEnv();

		await executeAgent({
			sessionId,
			prompt,
			cwd: session.cwd,
			pathToClaudeCodeExecutable: getClaudeBinaryPath(),
			env: agentEnv,
			model: session.model,
			permissionMode: session.permissionMode ?? "default",
			maxThinkingTokens: session.maxThinkingTokens,
			signal: abortController.signal,
			onChunk,
			onPermissionRequest: async (params) => {
				this.deps.emitPermissionRequest({
					type: "permission_request",
					sessionId,
					toolUseId: params.toolUseId,
					toolName: params.toolName,
					input: params.input,
				});

				return createPermissionRequest({
					toolUseId: params.toolUseId,
					signal: params.signal,
				});
			},
			onEvent: (event) => {
				if (event.type === "session_initialized") {
					this.deps.store
						.update(sessionId, {
							providerSessionId: event.claudeSessionId,
							lastActiveAt: Date.now(),
						})
						.catch((err: unknown) => {
							console.error(
								`[chat/session] Failed to update providerSessionId:`,
								err,
							);
						});
				}
			},
		});
	}

	resolvePermission({
		sessionId,
		toolUseId,
		approved,
		updatedInput,
	}: ResolvePermissionInput): void {
		const result = approved
			? {
					behavior: "allow" as const,
					updatedInput: updatedInput ?? {},
				}
			: { behavior: "deny" as const, message: "User denied permission" };

		const resolved = resolvePendingPermission({ toolUseId, result });
		if (!resolved) {
			console.warn(
				`[chat/session] No pending permission for toolUseId=${toolUseId} in session ${sessionId}`,
			);
		}
	}
}
