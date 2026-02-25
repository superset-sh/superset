import {
	ModelSelectorGroup,
	ModelSelectorItem,
	ModelSelectorLogo,
	ModelSelectorName,
} from "@superset/ui/ai-elements/model-selector";
import { claudeIcon } from "@superset/ui/icons/preset-icons";
import type { ModelOption } from "../../../../types";
import {
	ANTHROPIC_LOGO_PROVIDER,
	OPENAI_LOGO_PROVIDER,
	providerToLogo,
} from "../../utils/providerToLogo";
import { AnthropicProviderHeading } from "./components/AnthropicProviderHeading";
import { OpenAIProviderHeading } from "./components/OpenAIProviderHeading";

interface ModelProviderGroupProps {
	provider: string;
	models: ModelOption[];
	isAnthropicAuthenticated: boolean;
	isAnthropicOAuthPending: boolean;
	onStartAnthropicOAuth: () => void;
	isOpenAIAuthenticated: boolean;
	isOpenAIApiKeyPending: boolean;
	onOpenOpenAIApiKeyDialog: () => void;
	onSelectModel: (model: ModelOption) => void;
	onCloseModelSelector: () => void;
}

export function ModelProviderGroup({
	provider,
	models,
	isAnthropicAuthenticated,
	isAnthropicOAuthPending,
	onStartAnthropicOAuth,
	isOpenAIAuthenticated,
	isOpenAIApiKeyPending,
	onOpenOpenAIApiKeyDialog,
	onSelectModel,
	onCloseModelSelector,
}: ModelProviderGroupProps) {
	const groupLogo = providerToLogo(provider);
	const isAnthropicProvider = groupLogo === ANTHROPIC_LOGO_PROVIDER;
	const isOpenAIProvider = groupLogo === OPENAI_LOGO_PROVIDER;
	const isConnected = isAnthropicProvider
		? isAnthropicAuthenticated
		: isOpenAIProvider
			? isOpenAIAuthenticated
			: true;
	const heading =
		isAnthropicProvider || isOpenAIProvider
			? `${provider} ${isConnected ? "• Connected" : "• Not connected"}`
			: provider;

	return (
		<ModelSelectorGroup
			key={provider}
			heading={isAnthropicProvider || isOpenAIProvider ? undefined : heading}
		>
			{isAnthropicProvider ? (
				<AnthropicProviderHeading
					heading={heading}
					isConnected={isConnected}
					isPending={isAnthropicOAuthPending}
					onStartOAuth={onStartAnthropicOAuth}
				/>
			) : isOpenAIProvider ? (
				<OpenAIProviderHeading
					heading={heading}
					isConnected={isConnected}
					isPending={isOpenAIApiKeyPending}
					onConfigureApiKey={onOpenOpenAIApiKeyDialog}
				/>
			) : null}

			{models.map((model) => {
				const logo = providerToLogo(model.provider);
				const modelDisabled =
					(logo === ANTHROPIC_LOGO_PROVIDER && !isAnthropicAuthenticated) ||
					(logo === OPENAI_LOGO_PROVIDER && !isOpenAIAuthenticated);
				const disabledLabel =
					logo === OPENAI_LOGO_PROVIDER
						? `${model.provider} (API key required)`
						: `${model.provider} (connection required)`;

				return (
					<ModelSelectorItem
						key={model.id}
						value={model.id}
						disabled={modelDisabled}
						onSelect={() => {
							onSelectModel(model);
							onCloseModelSelector();
						}}
					>
						{logo === ANTHROPIC_LOGO_PROVIDER ? (
							<img alt="Claude" className="size-3" src={claudeIcon} />
						) : (
							<ModelSelectorLogo provider={logo} />
						)}
						<div className="flex flex-1 flex-col gap-0.5">
							<ModelSelectorName>{model.name}</ModelSelectorName>
							<span className="text-muted-foreground text-xs">
								{modelDisabled ? disabledLabel : model.provider}
							</span>
						</div>
					</ModelSelectorItem>
				);
			})}
		</ModelSelectorGroup>
	);
}
