"use client";

import { ModelSelectorLogo } from "@superset/ui/ai-elements/model-selector";
import { ChevronDown } from "lucide-react";
import type { MockModel } from "../../../../mock-data";
import { ResponsiveDropdown } from "../../../ResponsiveDropdown";

type ModelPickerProps = {
	models: MockModel[];
	selectedModel: MockModel;
	onModelChange: (model: MockModel) => void;
	disabled?: boolean;
};

export function ModelPicker({
	models,
	selectedModel,
	onModelChange,
	disabled = false,
}: ModelPickerProps) {
	return (
		<ResponsiveDropdown
			title="Select model"
			items={models.map((model) => ({
				label: model.name,
				icon: (
					<ModelSelectorLogo provider={model.provider} className="size-3.5" />
				),
				onSelect: () => onModelChange(model),
			}))}
			trigger={
				<button
					type="button"
					disabled={disabled}
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
