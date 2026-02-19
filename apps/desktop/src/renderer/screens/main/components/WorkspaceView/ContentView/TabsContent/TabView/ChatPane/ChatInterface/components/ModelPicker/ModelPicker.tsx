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
import { useMemo } from "react";
import type { ModelOption } from "../../types";

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

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: {
	models: ModelOption[];
	selectedModel: ModelOption;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const groupedModels = useMemo(() => {
		const groups: Record<string, ModelOption[]> = {};
		for (const model of models) {
			const group = model.provider;
			if (!groups[group]) groups[group] = [];
			groups[group].push(model);
		}
		return groups;
	}, [models]);

	const selectedLogo = providerToLogo(selectedModel.provider);

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorTrigger asChild>
				<PromptInputButton className="gap-1.5 text-xs">
					<ModelSelectorLogo provider={selectedLogo} />
					<span>{selectedModel.name}</span>
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent title="Select Model">
				<ModelSelectorInput placeholder="Search models..." />
				<ModelSelectorList>
					<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
					{Object.entries(groupedModels).map(([provider, providerModels]) => (
						<ModelSelectorGroup key={provider} heading={provider}>
							{providerModels.map((model) => {
								const logo = providerToLogo(model.provider);
								return (
									<ModelSelectorItem
										key={model.id}
										value={model.id}
										onSelect={() => {
											onSelectModel(model);
											onOpenChange(false);
										}}
									>
										<ModelSelectorLogo provider={logo} />
										<div className="flex flex-1 flex-col gap-0.5">
											<ModelSelectorName>{model.name}</ModelSelectorName>
											<span className="text-muted-foreground text-xs">
												{model.provider}
											</span>
										</div>
									</ModelSelectorItem>
								);
							})}
						</ModelSelectorGroup>
					))}
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
