import type { AgentModelOption } from "@superset/shared/agent-models";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { sortAgentModelOptions } from "./sortAgentModelOptions";

// Radix Select reserves "" for clearing, so "Default" needs a sentinel.
const DEFAULT_MODEL_VALUE = "__default_model__";

export function resolveAgentModelSelectValue(
	models: AgentModelOption[],
	value: string | null,
	includeDefault: boolean,
): string | undefined {
	if (value !== null && models.some((model) => model.id === value)) {
		return value;
	}
	if (includeDefault) return DEFAULT_MODEL_VALUE;
	return models[0]?.id;
}

interface AgentModelSelectProps {
	models: AgentModelOption[];
	value: string | null;
	onValueChange: (model: string | null) => void;
	disabled?: boolean;
	triggerClassName?: string;
	contentClassName?: string;
	/** Trigger/item text for the default option — two adjacent selects both
	 * reading "Default" are indistinguishable, so callers name theirs. */
	defaultLabel?: string;
	includeDefault?: boolean;
}

export function AgentModelSelect({
	models,
	value,
	onValueChange,
	disabled,
	triggerClassName,
	contentClassName,
	defaultLabel = "Default",
	includeDefault = true,
}: AgentModelSelectProps) {
	const selectedValue = resolveAgentModelSelectValue(
		models,
		value,
		includeDefault,
	);
	const hasProviderGroups = models.some((model) => model.provider);
	const providerGroups = Map.groupBy(
		models,
		(model) => model.provider ?? "Other",
	);
	const sortedModels = sortAgentModelOptions(models);

	const handleValueChange = (nextValue: string) => {
		onValueChange(nextValue === DEFAULT_MODEL_VALUE ? null : nextValue);
	};

	return (
		<Select
			value={selectedValue}
			onValueChange={handleValueChange}
			disabled={disabled}
		>
			<SelectTrigger className={triggerClassName}>
				<SelectValue placeholder={defaultLabel} />
			</SelectTrigger>
			<SelectContent className={contentClassName}>
				{includeDefault && (
					<SelectItem value={DEFAULT_MODEL_VALUE}>{defaultLabel}</SelectItem>
				)}
				{hasProviderGroups
					? Array.from(providerGroups.entries()).map(
							([provider, providerModels], index) => (
								<SelectGroup key={provider}>
									{index > 0 && <SelectSeparator />}
									<SelectLabel>{provider}</SelectLabel>
									{sortAgentModelOptions(providerModels).map((model) => (
										<SelectItem key={model.id} value={model.id}>
											{model.label}
										</SelectItem>
									))}
								</SelectGroup>
							),
						)
					: sortedModels.map((model) => (
							<SelectItem key={model.id} value={model.id}>
								{model.label}
							</SelectItem>
						))}
			</SelectContent>
		</Select>
	);
}
