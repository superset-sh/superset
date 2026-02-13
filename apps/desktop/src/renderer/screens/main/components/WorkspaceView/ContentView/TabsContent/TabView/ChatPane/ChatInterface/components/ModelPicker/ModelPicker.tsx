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
import { MODELS } from "../../constants";
import type { ModelOption } from "../../types";

export function ModelPicker({
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: {
	selectedModel: ModelOption;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorTrigger asChild>
				<PromptInputButton className="gap-1.5 text-xs">
					<ModelSelectorLogo provider="anthropic" />
					<span>{selectedModel.name}</span>
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent title="Select Model">
				<ModelSelectorInput placeholder="Search models..." />
				<ModelSelectorList>
					<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
					<ModelSelectorGroup heading="Anthropic">
						{MODELS.map((model) => (
							<ModelSelectorItem
								key={model.id}
								value={model.id}
								onSelect={() => {
									onSelectModel(model);
									onOpenChange(false);
								}}
							>
								<ModelSelectorLogo provider="anthropic" />
								<div className="flex flex-1 flex-col gap-0.5">
									<ModelSelectorName>{model.name}</ModelSelectorName>
									<span className="text-muted-foreground text-xs">
										{model.description}
									</span>
								</div>
							</ModelSelectorItem>
						))}
					</ModelSelectorGroup>
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
