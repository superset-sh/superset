import type { AgentModelOption } from "@superset/shared/agent-models";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";

// Radix Select reserves "" for clearing, so "Default" needs a sentinel.
const DEFAULT_MODEL_VALUE = "__default_model__";

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
}

export function AgentModelSelect({
	models,
	value,
	onValueChange,
	disabled,
	triggerClassName,
	contentClassName,
	defaultLabel = "Default",
}: AgentModelSelectProps) {
	const selectedValue =
		value !== null && models.some((model) => model.id === value)
			? value
			: DEFAULT_MODEL_VALUE;

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
				<SelectItem value={DEFAULT_MODEL_VALUE}>{defaultLabel}</SelectItem>
				{models.map((model) => (
					<SelectItem key={model.id} value={model.id}>
						{model.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
