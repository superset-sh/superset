import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorTrigger,
} from "@superset/ui/ai-elements/model-selector";
import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import { ChevronDownIcon } from "lucide-react";
import { useMemo } from "react";
import { VirtualizedModelList } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/VirtualizedModelList";
import { PILL_BUTTON_CLASS } from "renderer/components/Chat/ChatInterface/styles";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { groupModelsByModelFamily } from "renderer/components/Chat/ChatInterface/utils/modelOptions";
import { ModelProviderIcon } from "renderer/components/ModelProviderIcon";

interface ModelPickerProps {
	models: ModelOption[];
	selectedModel: ModelOption | null;
	onSelectModel: (model: ModelOption) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ModelPicker({
	models,
	selectedModel,
	onSelectModel,
	open,
	onOpenChange,
}: ModelPickerProps) {
	const groupedModels = useMemo(
		() => groupModelsByModelFamily(models),
		[models],
	);

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorTrigger asChild>
				<PromptInputButton
					className={`${PILL_BUTTON_CLASS} px-2 gap-1.5 text-xs text-foreground`}
				>
					{selectedModel ? (
						<ModelProviderIcon
							className="size-3"
							modelId={selectedModel.name}
							provider={selectedModel.provider}
						/>
					) : null}
					<span>{selectedModel?.name ?? "Model"}</span>
					<ChevronDownIcon className="size-2.5 opacity-50" />
				</PromptInputButton>
			</ModelSelectorTrigger>
			<ModelSelectorContent shouldFilter={false} title="Select Model">
				<VirtualizedModelList
					groupedModels={groupedModels}
					onSelectModel={onSelectModel}
					onCloseModelSelector={() => {
						onOpenChange(false);
					}}
				/>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
