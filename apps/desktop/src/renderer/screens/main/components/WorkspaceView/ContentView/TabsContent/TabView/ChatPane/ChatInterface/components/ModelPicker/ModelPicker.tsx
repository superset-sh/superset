import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorInput,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { PILL_BUTTON_CLASS } from "../../styles";
import type { ModelOption } from "../../types";
import { AnthropicApiKeyDialog } from "./components/AnthropicApiKeyDialog";
import { AnthropicOAuthDialog } from "./components/AnthropicOAuthDialog";
import { ModelProviderGroup } from "./components/ModelProviderGroup";
import { OpenAIApiKeyDialog } from "./components/OpenAIApiKeyDialog";
import { OpenAIOAuthDialog } from "./components/OpenAIOAuthDialog";
import { ProviderAuthMethodDialog } from "./components/ProviderAuthMethodDialog";
import { useAnthropicApiKey } from "./hooks/useAnthropicApiKey";
import { useAnthropicOAuth } from "./hooks/useAnthropicOAuth";
import { useOpenAIApiKey } from "./hooks/useOpenAIApiKey";
import { useOpenAIOAuth } from "./hooks/useOpenAIOAuth";
import { groupModelsByProvider } from "./utils/groupModelsByProvider";
import {
	ANTHROPIC_LOGO_PROVIDER,
	providerToLogo,
} from "./utils/providerToLogo";

interface ModelPickerProps {
	models: ModelOption[];
	selectedModel: ModelOption | null;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type AuthProvider = "anthropic" | "openai";

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: ModelPickerProps) {
	const groupedModels = useMemo(() => groupModelsByProvider(models), [models]);
	const selectedLogo = selectedModel
		? providerToLogo(selectedModel.provider)
		: null;
	const [authMethodProvider, setAuthMethodProvider] =
		useState<AuthProvider | null>(null);

	const {
		isAnthropicAuthenticated,
		isStartingOAuth,
		startAnthropicOAuth,
		oauthDialog: anthropicOAuthDialog,
	} = useAnthropicOAuth({
		isModelSelectorOpen: open,
		onModelSelectorOpenChange: onOpenChange,
	});
	const {
		isAnthropicApiKeyConfigured,
		isSavingAnthropicApiKey,
		openAnthropicApiKeyDialog,
		apiKeyDialog: anthropicApiKeyDialog,
	} = useAnthropicApiKey({
		isModelSelectorOpen: open,
		onModelSelectorOpenChange: onOpenChange,
	});
	const {
		isOpenAIAuthenticated,
		isOpenAIApiKeyConfigured,
		isSavingOpenAIApiKey,
		openOpenAIApiKeyDialog,
		apiKeyDialog,
	} = useOpenAIApiKey({
		isModelSelectorOpen: open,
		onModelSelectorOpenChange: onOpenChange,
	});
	const {
		isStartingOAuth: isStartingOpenAIOAuth,
		startOpenAIOAuth,
		oauthDialog: openAIOAuthDialog,
	} = useOpenAIOAuth({
		isModelSelectorOpen: open,
		onModelSelectorOpenChange: onOpenChange,
	});
	const isAuthMethodDialogOpen = authMethodProvider !== null;
	const isAuthMethodDialogPending =
		isSavingAnthropicApiKey ||
		isStartingOAuth ||
		isSavingOpenAIApiKey ||
		isStartingOpenAIOAuth;

	const openAuthMethodDialog = (provider: AuthProvider) => {
		setAuthMethodProvider(provider);
		onOpenChange(false);
	};

	const closeAuthMethodDialog = (restoreModelSelector: boolean) => {
		setAuthMethodProvider(null);
		if (restoreModelSelector) {
			onOpenChange(true);
		}
	};

	return (
		<>
			<ModelSelector open={open} onOpenChange={onOpenChange}>
				<ModelSelectorTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-foreground`}
					>
						{selectedLogo === ANTHROPIC_LOGO_PROVIDER ? (
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
						{groupedModels.map(([provider, providerModels]) => (
							<ModelProviderGroup
								key={provider}
								provider={provider}
								models={providerModels}
								isAnthropicAuthenticated={isAnthropicAuthenticated}
								isAnthropicOAuthPending={isStartingOAuth}
								isAnthropicApiKeyPending={isSavingAnthropicApiKey}
								onOpenAnthropicAuthModal={() => {
									openAuthMethodDialog("anthropic");
								}}
								isOpenAIAuthenticated={isOpenAIAuthenticated}
								isOpenAIOAuthPending={isStartingOpenAIOAuth}
								isOpenAIApiKeyPending={isSavingOpenAIApiKey}
								onOpenOpenAIAuthModal={() => {
									openAuthMethodDialog("openai");
								}}
								onSelectModel={onSelectModel}
								onCloseModelSelector={() => {
									onOpenChange(false);
								}}
							/>
						))}
					</ModelSelectorList>
				</ModelSelectorContent>
			</ModelSelector>

			<ProviderAuthMethodDialog
				open={isAuthMethodDialogOpen}
				provider={authMethodProvider}
				isPending={isAuthMethodDialogPending}
				onOpenChange={(nextOpen) => {
					if (nextOpen) return;
					closeAuthMethodDialog(true);
				}}
				onSelectApiKey={() => {
					if (authMethodProvider === "anthropic") {
						openAnthropicApiKeyDialog();
					} else if (authMethodProvider === "openai") {
						openOpenAIApiKeyDialog();
					}
					closeAuthMethodDialog(false);
				}}
				onSelectOAuth={() => {
					if (authMethodProvider === "anthropic") {
						void startAnthropicOAuth();
					} else if (authMethodProvider === "openai") {
						void startOpenAIOAuth();
					}
					closeAuthMethodDialog(false);
				}}
			/>
			<AnthropicApiKeyDialog
				{...anthropicApiKeyDialog}
				canClearApiKey={isAnthropicApiKeyConfigured}
			/>
			<AnthropicOAuthDialog {...anthropicOAuthDialog} />
			<OpenAIApiKeyDialog
				{...apiKeyDialog}
				canClearApiKey={isOpenAIApiKeyConfigured}
			/>
			<OpenAIOAuthDialog {...openAIOAuthDialog} />
		</>
	);
}
