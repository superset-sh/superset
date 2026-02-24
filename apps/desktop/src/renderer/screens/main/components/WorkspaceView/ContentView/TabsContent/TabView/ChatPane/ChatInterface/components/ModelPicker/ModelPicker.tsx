import { chatServiceTrpc } from "@superset/chat/client";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorName,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ChevronDownIcon, Loader2Icon, Settings2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PILL_BUTTON_CLASS } from "../../styles";
import type { ModelOption } from "../../types";
import { AnthropicOAuthDialog } from "./components/AnthropicOAuthDialog";

/** Derive a logo provider slug from the provider name */
function providerToLogo(provider: string): string {
	const lower = provider.toLowerCase();
	if (lower.includes("anthropic") || lower.includes("claude"))
		return "anthropic";
	if (lower.includes("openai") || lower.includes("gpt")) return "openai";
	if (lower.includes("google") || lower.includes("gemini")) return "google";
	if (lower.includes("mistral")) return "mistral";
	if (lower.includes("deepseek")) return "deepseek";
	if (lower.includes("xai") || lower.includes("grok")) return "xai";
	return lower;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: {
	models: ModelOption[];
	selectedModel: ModelOption | null;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
	const [oauthUrl, setOauthUrl] = useState<string | null>(null);
	const [oauthCode, setOauthCode] = useState("");
	const [oauthError, setOauthError] = useState<string | null>(null);
	const [hasPendingOAuthSession, setHasPendingOAuthSession] = useState(false);

	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const startAnthropicOAuthMutation =
		chatServiceTrpc.auth.startAnthropicOAuth.useMutation();
	const completeAnthropicOAuthMutation =
		chatServiceTrpc.auth.completeAnthropicOAuth.useMutation();
	const cancelAnthropicOAuthMutation =
		chatServiceTrpc.auth.cancelAnthropicOAuth.useMutation();

	const groupedModels = useMemo(() => {
		const groups: Record<string, ModelOption[]> = {};
		for (const model of models) {
			const group = model.provider;
			if (!groups[group]) groups[group] = [];
			groups[group].push(model);
		}
		return groups;
	}, [models]);

	const selectedLogo = selectedModel
		? providerToLogo(selectedModel.provider)
		: null;
	const isAnthropicAuthenticated = anthropicStatus?.authenticated ?? false;

	useEffect(() => {
		if (!open) return;
		void refetchAnthropicStatus();
	}, [open, refetchAnthropicStatus]);

	const openExternalUrl = useCallback(async (url: string) => {
		try {
			await electronTrpcClient.external.openUrl.mutate(url);
			return;
		} catch (ipcError) {
			console.warn(
				"[model-picker] external.openUrl failed, falling back:",
				ipcError,
			);
		}

		window.open(url, "_blank");
	}, []);

	const openOAuthUrl = useCallback(async () => {
		if (!oauthUrl) return;
		try {
			await openExternalUrl(oauthUrl);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to open browser"));
		}
	}, [oauthUrl, openExternalUrl]);

	const startAnthropicOAuth = useCallback(async () => {
		setOauthError(null);

		try {
			const result = await startAnthropicOAuthMutation.mutateAsync();
			setOauthUrl(result.url);
			setOauthCode("");
			setHasPendingOAuthSession(true);
			setOauthDialogOpen(true);
		} catch (error) {
			setOauthDialogOpen(true);
			setOauthError(
				getErrorMessage(error, "Failed to start Anthropic OAuth flow"),
			);
		}
	}, [startAnthropicOAuthMutation]);

	const copyOAuthUrl = useCallback(async () => {
		if (!oauthUrl) return;
		try {
			await navigator.clipboard.writeText(oauthUrl);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to copy URL"));
		}
	}, [oauthUrl]);

	const pasteOAuthCode = useCallback(async () => {
		try {
			const pasted = await navigator.clipboard.readText();
			setOauthCode(pasted);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to read clipboard"));
		}
	}, []);

	const completeAnthropicOAuth = useCallback(async () => {
		const code = oauthCode.trim();
		if (!code) return;

		setOauthError(null);
		try {
			await completeAnthropicOAuthMutation.mutateAsync({ code });
			setHasPendingOAuthSession(false);
			setOauthDialogOpen(false);
			setOauthUrl(null);
			setOauthCode("");
			onOpenChange(true);
			await refetchAnthropicStatus();
		} catch (error) {
			setOauthError(
				getErrorMessage(error, "Failed to complete Anthropic OAuth"),
			);
		}
	}, [
		completeAnthropicOAuthMutation,
		oauthCode,
		onOpenChange,
		refetchAnthropicStatus,
	]);

	const onOAuthDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOauthDialogOpen(nextOpen);
			if (nextOpen) return;
			onOpenChange(true);

			setOauthCode("");
			setOauthError(null);
			setOauthUrl(null);

			if (hasPendingOAuthSession) {
				void cancelAnthropicOAuthMutation.mutateAsync().catch((error) => {
					console.error(
						"[model-picker] Failed to cancel Anthropic OAuth:",
						error,
					);
				});
				setHasPendingOAuthSession(false);
			}
		},
		[cancelAnthropicOAuthMutation, hasPendingOAuthSession, onOpenChange],
	);

	return (
		<>
			<ModelSelector open={open} onOpenChange={onOpenChange}>
				<ModelSelectorTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-foreground`}
					>
						{selectedLogo === "anthropic" ? (
							<img alt="Claude" className="size-3" src={claudeIcon} />
						) : selectedLogo ? (
							<ModelSelectorLogo provider={selectedLogo} />
						) : null}
						<span>{selectedModel?.name ?? "Model"}</span>
						<ChevronDownIcon className="size-2.5 opacity-50" />
					</PromptInputButton>
				</ModelSelectorTrigger>
				<ModelSelectorContent title="Select Model">
					<ModelSelectorInput placeholder="Search models..." />
					<ModelSelectorList>
						<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
						{Object.entries(groupedModels).map(([provider, providerModels]) => {
							const groupLogo = providerToLogo(provider);
							const isAnthropicProvider = groupLogo === "anthropic";
							const isConnected = isAnthropicProvider
								? isAnthropicAuthenticated
								: true;
							const heading = isAnthropicProvider
								? `${provider} ${isConnected ? "• Connected" : "• Not connected"}`
								: provider;

							return (
								<ModelSelectorGroup
									key={provider}
									heading={isAnthropicProvider ? undefined : heading}
								>
									{isAnthropicProvider ? (
										<div className="text-muted-foreground flex items-center justify-between px-2 py-1.5 text-xs font-medium">
											<span>{heading}</span>
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														aria-label={
															isConnected
																? "Re-auth Anthropic"
																: "Connect Anthropic"
														}
														className="text-muted-foreground hover:text-foreground hover:bg-accent/60 inline-flex size-6 items-center justify-center rounded-md transition-colors"
														disabled={startAnthropicOAuthMutation.isPending}
														onClick={(event) => {
															event.preventDefault();
															event.stopPropagation();
															void startAnthropicOAuth();
														}}
													>
														{startAnthropicOAuthMutation.isPending ? (
															<Loader2Icon className="size-4 animate-spin" />
														) : (
															<Settings2Icon className="size-4" />
														)}
													</button>
												</TooltipTrigger>
												<TooltipContent
													side="top"
													sideOffset={6}
													showArrow={false}
												>
													{isConnected
														? "Re-auth Anthropic"
														: "Connect Anthropic"}
												</TooltipContent>
											</Tooltip>
										</div>
									) : null}

									{providerModels.map((model) => {
										const logo = providerToLogo(model.provider);
										const modelDisabled =
											logo === "anthropic" && !isAnthropicAuthenticated;

										return (
											<ModelSelectorItem
												key={model.id}
												value={model.id}
												disabled={modelDisabled}
												onSelect={() => {
													onSelectModel(model);
													onOpenChange(false);
												}}
											>
												{logo === "anthropic" ? (
													<img
														alt="Claude"
														className="size-3"
														src={claudeIcon}
													/>
												) : (
													<ModelSelectorLogo provider={logo} />
												)}
												<div className="flex flex-1 flex-col gap-0.5">
													<ModelSelectorName>{model.name}</ModelSelectorName>
													<span className="text-muted-foreground text-xs">
														{modelDisabled
															? `${model.provider} (connect required)`
															: model.provider}
													</span>
												</div>
											</ModelSelectorItem>
										);
									})}
								</ModelSelectorGroup>
							);
						})}
					</ModelSelectorList>
				</ModelSelectorContent>
			</ModelSelector>

			<AnthropicOAuthDialog
				open={oauthDialogOpen}
				authUrl={oauthUrl}
				code={oauthCode}
				errorMessage={oauthError}
				isPending={completeAnthropicOAuthMutation.isPending}
				onOpenChange={onOAuthDialogOpenChange}
				onCodeChange={setOauthCode}
				onOpenAuthUrl={() => {
					void openOAuthUrl();
				}}
				onCopyAuthUrl={() => {
					void copyOAuthUrl();
				}}
				onPasteCode={() => {
					void pasteOAuthCode();
				}}
				onSubmit={() => {
					void completeAnthropicOAuth();
				}}
			/>
		</>
	);
}
