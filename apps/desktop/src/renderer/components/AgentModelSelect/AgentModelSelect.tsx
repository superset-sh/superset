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
import { groupModelOptions } from "./groupModelOptions";

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
				{groupModelOptions(models).map((group, index) => (
					// Index-qualified: a catalog may return to an earlier header
					// (groupModelOptions keeps those as separate sections), and a
					// bare label would then collide as a React key.
					<SelectGroup key={`${group.label ?? "ungrouped"}-${index}`}>
						{group.label !== null && (
							<>
								{/* Every kind-change gets a rule, including the one
								    between the default escape hatch and the first
								    section — it is not a member of that section. */}
								<SelectSeparator />
								<SelectLabel className="text-xs text-muted-foreground">
									{group.label}
								</SelectLabel>
							</>
						)}
						{group.options.map((model) => (
							<SelectItem key={model.id} value={model.id}>
								{model.label}
							</SelectItem>
						))}
					</SelectGroup>
				))}
			</SelectContent>
		</Select>
	);
}
