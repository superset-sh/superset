import type { TriggerScope } from "@superset/shared/automation-triggers";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { ChipButton } from "../../../../TriggerSentence/components/ChipButton";
import { TokenField } from "../TokenField";

/**
 * An optional filter over values only the person writing the trigger knows —
 * label names, branch names.
 *
 * There is no list to offer: labels and branches are per-repository and the
 * editor has not been told which repository yet, so a picker would show an
 * empty search box. Typing is the whole interaction, and clearing the last
 * value returns the filter to "any" rather than leaving an empty list, which
 * would match nothing and read as the same thing.
 */
export function TypedScopeChip({
	scope,
	onChange,
	anyLabel,
	placeholder,
	countNoun,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	/** Shown when nothing is filtered — "Any label". */
	anyLabel: string;
	placeholder: string;
	countNoun: { singular: string; plural: string };
	disabled?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const values = scope.mode === "list" ? scope.ids : [];

	const label =
		values.length === 0
			? anyLabel
			: values.length === 1
				? (values[0] ?? anyLabel)
				: `${values.length} ${countNoun.plural}`;

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (disabled) return;
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<span>
					<ChipButton label={label} disabled={disabled} className={className} />
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				<TokenField
					values={values}
					onChange={(ids) =>
						onChange(ids.length ? { mode: "list", ids } : { mode: "any" })
					}
					placeholder={placeholder}
				/>
			</PopoverContent>
		</Popover>
	);
}
