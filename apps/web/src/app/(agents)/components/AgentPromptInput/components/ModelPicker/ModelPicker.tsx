"use client";

import { ModelSelectorLogo } from "@superset/ui/ai-elements/model-selector";
import { ChevronDown } from "lucide-react";
import { type MockModel, mockModels } from "../../../../mock-data";
import { ResponsiveDropdown } from "../../../ResponsiveDropdown";

type ModelPickerProps = {
	selectedModel: MockModel;
	onModelChange: (model: MockModel) => void;
};

export function ModelPicker({
	selectedModel,
	onModelChange,
}: ModelPickerProps) {
	return (
		<ResponsiveDropdown
			title="Select model"
			items={mockModels.map((model) => ({
				label: model.name,
				icon: (
					<ModelSelectorLogo provider={model.provider} className="size-3.5" />
				),
				onSelect: () => onModelChange(model),
			}))}
			trigger={
				<button
					type="button"
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<ModelSelectorLogo
						provider={selectedModel.provider}
						className="size-3.5"
					/>
					<span>{selectedModel.name}</span>
					<ChevronDown className="size-3" />
				</button>
			}
		/>
	);
}
