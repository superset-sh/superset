import { AGENT_MODEL_ALIASES } from "@superset/shared/agent-library";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useState } from "react";

const DEFAULT_VALUE = "__default__";
const CUSTOM_VALUE = "__custom__";

const ALIAS_SET = new Set<string>(AGENT_MODEL_ALIASES);

/**
 * Picker for the Claude Code `model:` frontmatter value. Aliases are offered
 * directly; "Custom" accepts any model id so a model released five minutes
 * ago is usable without a Superset update. `null` = no `model:` key (inherit).
 */
export function ModelSelect({
	value,
	onChange,
	disabled,
	placeholder = "Default (inherit)",
}: {
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
	placeholder?: string;
}) {
	const isCustom = value !== null && !ALIAS_SET.has(value);
	const [customMode, setCustomMode] = useState(isCustom);
	const selectValue =
		value === null
			? DEFAULT_VALUE
			: customMode || isCustom
				? CUSTOM_VALUE
				: value;

	return (
		<div className="flex items-center gap-2">
			<Select
				disabled={disabled}
				value={selectValue}
				onValueChange={(next) => {
					if (next === DEFAULT_VALUE) {
						setCustomMode(false);
						onChange(null);
						return;
					}
					if (next === CUSTOM_VALUE) {
						setCustomMode(true);
						if (!isCustom) onChange("");
						return;
					}
					setCustomMode(false);
					onChange(next);
				}}
			>
				<SelectTrigger className="w-44">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={DEFAULT_VALUE}>{placeholder}</SelectItem>
					{AGENT_MODEL_ALIASES.map((alias) => (
						<SelectItem key={alias} value={alias}>
							{alias}
						</SelectItem>
					))}
					<SelectItem value={CUSTOM_VALUE}>Custom…</SelectItem>
				</SelectContent>
			</Select>
			{(customMode || isCustom) && (
				<Input
					className="h-8 w-52"
					placeholder="claude-fable-5"
					value={value ?? ""}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</div>
	);
}
