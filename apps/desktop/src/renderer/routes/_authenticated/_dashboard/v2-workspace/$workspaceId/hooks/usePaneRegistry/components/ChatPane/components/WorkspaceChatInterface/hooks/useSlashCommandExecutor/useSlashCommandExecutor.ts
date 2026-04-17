import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import type {
	McpOverviewPayload,
	ModelOption,
} from "renderer/components/Chat/ChatInterface/types";
import {
	findModelByQuery,
	normalizeModelQueryFromActionArgument,
} from "./model-query";

interface UseSlashCommandExecutorOptions {
	sessionId: string | null;
	workspaceId: string;
	cwd: string;
	availableModels: ModelOption[];
	canAbort: boolean;
	onResetSession: () => Promise<void>;
	onStopActiveResponse: () => void;
	onSelectModel: (model: ModelOption) => void;
	onOpenModelPicker: () => void;
	onSetErrorMessage: (message: string) => void;
	onClearError: () => void;
	onShowMcpOverview: (overview: McpOverviewPayload) => void;
	loadMcpOverview?: (cwd: string) => Promise<McpOverviewPayload>;
	onTrackEvent?: (event: string, properties: Record<string, unknown>) => void;
}

interface ResolveSlashCommandResult {
	handled: boolean;
	nextText: string;
}

export function useSlashCommandExecutor({
	sessionId,
	workspaceId,
	cwd,
	availableModels,
	canAbort,
	onResetSession,
	onStopActiveResponse,
	onSelectModel,
	onOpenModelPicker,
	onSetErrorMessage,
	onClearError,
	onShowMcpOverview,
	loadMcpOverview,
	onTrackEvent,
}: UseSlashCommandExecutorOptions) {
	const workspaceTrpcUtils = workspaceTrpc.useUtils();

	const resolveSlashCommandInput = useCallback(
		async (inputText: string): Promise<ResolveSlashCommandResult> => {
			const text = inputText.trim();
			if (!text.startsWith("/")) {
				return { handled: false, nextText: text };
			}

			if (!sessionId) {
				if (text === "/new" || text === "/clear") {
					onClearError();
					await onResetSession();
					toast.success(
						text === "/clear"
							? "Context cleared in a new chat session"
							: "Started a new chat session",
					);
					return { handled: true, nextText: "" };
				}

				return { handled: false, nextText: text };
			}

			try {
				const [commandNameRaw, ...rest] = text.slice(1).split(/\s+/);
				const commandName = commandNameRaw?.toLowerCase() ?? "";
				const argument = rest.join(" ").trim();

				switch (commandName) {
					case "new":
					case "clear": {
						onClearError();
						await onResetSession();
						toast.success(
							commandName === "clear"
								? "Context cleared in a new chat session"
								: "Started a new chat session",
						);
						onTrackEvent?.("chat_slash_command_used", {
							command_name: commandName,
							command_type: "new_session",
						});
						return { handled: true, nextText: "" };
					}
					case "stop":
						if (canAbort) {
							toast.success("Stopped current response");
							onStopActiveResponse();
						} else {
							toast.warning("No active response to stop");
						}
						onTrackEvent?.("chat_slash_command_used", {
							command_name: commandName,
							command_type: "stop_stream",
						});
						return { handled: true, nextText: "" };
					case "model": {
						const modelQuery = normalizeModelQueryFromActionArgument(argument);
						if (!modelQuery) {
							onClearError();
							onOpenModelPicker();
							return { handled: true, nextText: "" };
						}

						const matchedModel = findModelByQuery(availableModels, modelQuery);
						if (!matchedModel) {
							const modelError = `Model not found: ${modelQuery}`;
							onSetErrorMessage(modelError);
							toast.error(modelError);
							return { handled: true, nextText: "" };
						}

						onSelectModel(matchedModel);
						onClearError();
						toast.success(`Model set to ${matchedModel.name}`);
						onTrackEvent?.("chat_model_changed", {
							model_id: matchedModel.id,
							model_name: matchedModel.name,
							trigger: "slash_command",
						});
						onTrackEvent?.("chat_slash_command_used", {
							command_name: commandName,
							command_type: "set_model",
						});
						return { handled: true, nextText: "" };
					}
					case "mcp": {
						if (!sessionId) {
							return { handled: false, nextText: text };
						}

						try {
							const overview = loadMcpOverview
								? await loadMcpOverview(cwd)
								: await workspaceTrpcUtils.chat.getMcpOverview.fetch({
										sessionId,
										workspaceId,
									});
							onClearError();
							onShowMcpOverview(overview);
						} catch (error) {
							console.warn(
								"[chat] Failed to load MCP overview from settings",
								error,
							);
							const overviewError = "Failed to load MCP settings";
							onSetErrorMessage(overviewError);
							toast.error(overviewError);
						}
						onTrackEvent?.("chat_slash_command_used", {
							command_name: commandName,
							command_type: "show_mcp_overview",
						});
						return { handled: true, nextText: "" };
					}
					default:
						return { handled: false, nextText: text };
				}
			} catch (error) {
				console.warn(
					"[chat] Failed to resolve slash command, sending raw input",
					error,
				);
				toast.warning("Slash command resolution failed; sending as plain text");
				return { handled: false, nextText: text };
			}
		},
		[
			availableModels,
			canAbort,
			cwd,
			onClearError,
			onOpenModelPicker,
			onSelectModel,
			onSetErrorMessage,
			onShowMcpOverview,
			onTrackEvent,
			loadMcpOverview,
			onResetSession,
			onStopActiveResponse,
			sessionId,
			workspaceId,
			workspaceTrpcUtils.chat.getMcpOverview,
		],
	);

	return {
		resolveSlashCommandInput,
	};
}
