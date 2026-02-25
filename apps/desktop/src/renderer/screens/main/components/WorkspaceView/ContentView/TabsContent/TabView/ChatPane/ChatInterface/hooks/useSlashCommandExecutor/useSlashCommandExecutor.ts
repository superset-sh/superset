import { chatServiceTrpc } from "@superset/chat/client";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import type { McpOverviewPayload, ModelOption } from "../../types";
import {
	findModelByQuery,
	normalizeModelQueryFromActionArgument,
} from "./model-query";
import { resolveSlashPromptResult } from "./prompt-result";

interface UseSlashCommandExecutorOptions {
	cwd: string;
	availableModels: ModelOption[];
	canAbort: boolean;
	onStartFreshSession: () => Promise<{
		created: boolean;
		errorMessage?: string;
	}>;
	onStopActiveResponse: () => void;
	onSelectModel: (model: ModelOption) => void;
	onOpenModelPicker: () => void;
	onSetErrorMessage: (message: string) => void;
	onClearError: () => void;
	onShowMcpOverview: (overview: McpOverviewPayload) => void;
}

interface ResolveSlashCommandResult {
	handled: boolean;
	nextText: string;
}

export function useSlashCommandExecutor({
	cwd,
	availableModels,
	canAbort,
	onStartFreshSession,
	onStopActiveResponse,
	onSelectModel,
	onOpenModelPicker,
	onSetErrorMessage,
	onClearError,
	onShowMcpOverview,
}: UseSlashCommandExecutorOptions) {
	const { mutateAsync: resolveSlashCommandMutateAsync } =
		chatServiceTrpc.workspace.resolveSlashCommand.useMutation();
	const chatServiceTrpcUtils = chatServiceTrpc.useUtils();

	const resolveSlashCommandInput = useCallback(
		async (inputText: string): Promise<ResolveSlashCommandResult> => {
			const text = inputText.trim();
			if (!text.startsWith("/")) {
				return { handled: false, nextText: text };
			}

			try {
				const resolvedCommand = await resolveSlashCommandMutateAsync({
					cwd,
					text,
				});

				if (!resolvedCommand.handled) {
					return { handled: false, nextText: text };
				}

				if (resolvedCommand.action) {
					switch (resolvedCommand.action.type) {
						case "new_session": {
							onClearError();
							const startResult = await onStartFreshSession();
							if (startResult.created) {
								toast.success(
									resolvedCommand.invokedAs?.toLowerCase() === "clear"
										? "Context cleared in a new chat session"
										: "Started a new chat session",
								);
							} else if (startResult.errorMessage) {
								toast.error(startResult.errorMessage);
							}
							return { handled: true, nextText: "" };
						}
						case "stop_stream":
							if (canAbort) {
								toast.success("Stopped current response");
							} else {
								toast.warning("No active response to stop");
							}
							onStopActiveResponse();
							return { handled: true, nextText: "" };
						case "set_model": {
							const modelQuery = normalizeModelQueryFromActionArgument(
								resolvedCommand.action.argument ?? "",
							);
							if (!modelQuery) {
								onClearError();
								onOpenModelPicker();
								return { handled: true, nextText: "" };
							}

							const matchedModel = findModelByQuery(
								availableModels,
								modelQuery,
							);
							if (!matchedModel) {
								const modelError = `Model not found: ${modelQuery}`;
								onSetErrorMessage(modelError);
								toast.error(modelError);
								return { handled: true, nextText: "" };
							}

							onSelectModel(matchedModel);
							onClearError();
							toast.success(`Model set to ${matchedModel.name}`);
							return { handled: true, nextText: "" };
						}
						case "show_mcp_overview": {
							try {
								const overview =
									await chatServiceTrpcUtils.workspace.getMcpOverview.fetch({
										cwd,
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
							return { handled: true, nextText: "" };
						}
						default: {
							const unknownActionType = String(
								(resolvedCommand.action as { type: unknown }).type,
							);
							const errorMessage = `Unsupported slash command action: ${unknownActionType}`;
							console.warn("[chat] Unsupported slash command action", {
								action: unknownActionType,
							});
							onSetErrorMessage(errorMessage);
							toast.error(errorMessage);
							return { handled: true, nextText: "" };
						}
					}
				}

				const promptResolution = resolveSlashPromptResult({
					handled: resolvedCommand.handled,
					prompt: resolvedCommand.prompt,
					commandName: resolvedCommand.commandName,
					invokedAs: resolvedCommand.invokedAs,
				});
				if (promptResolution.errorMessage) {
					onSetErrorMessage(promptResolution.errorMessage);
					toast.error(promptResolution.errorMessage);
					return { handled: true, nextText: "" };
				}

				onClearError();
				return {
					handled: promptResolution.handled,
					nextText: promptResolution.nextText,
				};
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
			onStartFreshSession,
			onStopActiveResponse,
			chatServiceTrpcUtils.workspace.getMcpOverview,
			resolveSlashCommandMutateAsync,
		],
	);

	return {
		resolveSlashCommandInput,
	};
}
