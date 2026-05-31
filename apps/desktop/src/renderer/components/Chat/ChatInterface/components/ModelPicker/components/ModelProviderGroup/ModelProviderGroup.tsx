import {
	ModelSelectorGroup,
	ModelSelectorItem,
	ModelSelectorName,
} from "@superset/ui/ai-elements/model-selector";
import { ModelProviderIcon } from "renderer/components/ModelProviderIcon";
import type { ModelOption } from "../../../../types";
import { getModelSearchKeywords } from "../../../../utils/modelOptions";

interface ModelProviderGroupProps {
	provider: string;
	models: ModelOption[];
	onSelectModel: (model: ModelOption) => void;
	onCloseModelSelector: () => void;
}

export function ModelProviderGroup({
	provider,
	models,
	onSelectModel,
	onCloseModelSelector,
}: ModelProviderGroupProps) {
	return (
		<ModelSelectorGroup key={provider} heading={provider}>
			{models.map((model) => {
				return (
					<ModelSelectorItem
						key={model.id}
						keywords={getModelSearchKeywords(model)}
						value={model.name}
						onSelect={() => {
							onSelectModel(model);
							onCloseModelSelector();
						}}
					>
						<ModelProviderIcon
							className="size-3"
							modelId={model.name}
							provider={model.provider}
						/>
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
	);
}
