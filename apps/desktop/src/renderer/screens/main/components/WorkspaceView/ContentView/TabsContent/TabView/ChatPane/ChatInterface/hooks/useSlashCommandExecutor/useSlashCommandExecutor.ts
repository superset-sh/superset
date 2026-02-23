import { chatServiceTrpc } from "@superset/chat/client";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import type { ModelOption } from "../../types";

interface UseSlashCommandExecutorOptions {
	cwd: string;
	availableModels: ModelOption[];
	canAbort: boolean;
	onStartFreshSession: () => Promise<boolean>;
	onStopActiveResponse: () => void;
	onSelectModel: (model: ModelOption) => void;
	onSetErrorMessage: (message: string) => void;
	onClearError: () => void;
}

interface ResolveSlashCommandResult {
	handled: boolean;
	nextText: string;
}

function findModelByQuery(
	models: ModelOption[],
	query: string,
): ModelOption | null {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return null;

	const exactById = models.find(
		(model) => model.id.toLowerCase() === normalizedQuery,
	);
	if (exactById) return exactById;

	const exactByName = models.find(
		(model) => model.name.toLowerCase() === normalizedQuery,
	);
	if (exactByName) return exactByName;

	return (
		models.find(
			(model) =>
				model.id.toLowerCase().includes(normalizedQuery) ||
				model.name.toLowerCase().includes(normalizedQuery),
		) ?? null
	);
}

export function useSlashCommandExecutor({
	cwd,
	availableModels,
	canAbort,
	onStartFreshSession,
	onStopActiveResponse,
	onSelectModel,
	onSetErrorMessage,
	onClearError,
}: UseSlashCommandExecutorOptions) {
	const resolveSlashCommandMutation =
		chatServiceTrpc.workspace.resolveSlashCommand.useMutation();

	const resolveSlashCommandInput = useCallback(
		async (inputText: string): Promise<ResolveSlashCommandResult> => {
			const text = inputText.trim();
			if (!text.startsWith("/")) {
				return { handled: false, nextText: text };
			}

			try {
				const resolvedCommand = await resolveSlashCommandMutation.mutateAsync({
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
							const created = await onStartFreshSession();
							if (created) {
								toast.success(
									resolvedCommand.invokedAs?.toLowerCase() === "clear"
										? "Context cleared in a new chat session"
										: "Started a new chat session",
								);
							} else {
								toast.error("Failed to start a new chat session");
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
							const modelQuery = (resolvedCommand.action.argument ?? "").trim();
							if (!modelQuery) {
								const usage = "Usage: /model <model-id-or-name>";
								onSetErrorMessage(usage);
								toast.error(usage);
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
					}
				}

				onClearError();
				return {
					handled: false,
					nextText: (resolvedCommand.prompt ?? "").trim(),
				};
			} catch (error) {
				console.warn(
					"[chat] Failed to resolve slash command, sending raw input",
					error,
				);
				return { handled: false, nextText: text };
			}
		},
		[
			availableModels,
			canAbort,
			cwd,
			onClearError,
			onSelectModel,
			onSetErrorMessage,
			onStartFreshSession,
			onStopActiveResponse,
			resolveSlashCommandMutation,
		],
	);

	return {
		resolveSlashCommandInput,
	};
}
