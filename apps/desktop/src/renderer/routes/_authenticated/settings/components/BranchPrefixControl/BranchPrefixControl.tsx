import {
	type BranchPrefixMode,
	sanitizeSegment,
} from "@superset/shared/workspace-launch";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useEffect, useState } from "react";
import {
	BRANCH_PREFIX_MODE_LABELS,
	BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT,
} from "../../utils/branch-prefix";

/** Select value standing in for "no override — inherit the host default". */
const DEFAULT_VALUE = "default";

/** Mode communicated by the control. `null` only appears when `showDefault`. */
export type BranchPrefixControlMode = BranchPrefixMode | null;

interface BranchPrefixControlProps {
	mode: BranchPrefixControlMode;
	customPrefix: string | null;
	/**
	 * When true, prepends a "Use global default" option whose value is `null`.
	 * Used by the per-project override; the host-wide default omits it.
	 */
	showDefault?: boolean;
	disabled?: boolean;
	onChange: (next: {
		mode: BranchPrefixControlMode;
		customPrefix: string | null;
	}) => void;
}

/**
 * Shared select+input for the v2 branch-prefix setting. Used by the host-wide
 * default (`V2GitSettings`) and the per-project override (`BranchPrefixSection`).
 * Sanitizes the custom prefix on blur. Empty custom on blur is treated as
 * "user is still typing": the input clears but no mutation fires.
 */
export function BranchPrefixControl({
	mode,
	customPrefix,
	showDefault = false,
	disabled,
	onChange,
}: BranchPrefixControlProps) {
	const [customPrefixInput, setCustomPrefixInput] = useState(
		customPrefix ?? "",
	);
	useEffect(() => {
		setCustomPrefixInput(customPrefix ?? "");
	}, [customPrefix]);

	const selectValue = mode ?? DEFAULT_VALUE;

	const labels = showDefault
		? BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT
		: BRANCH_PREFIX_MODE_LABELS;

	const handleModeChange = (value: string) => {
		const nextMode: BranchPrefixControlMode =
			value === DEFAULT_VALUE ? null : (value as BranchPrefixMode);
		onChange({ mode: nextMode, customPrefix: customPrefixInput || null });
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		// Empty sanitized prefix: don't persist `mode=custom, customPrefix=null`
		// — that lies about user intent. Leave the dropdown alone so they can
		// type again; an explicit mode change is how they exit `custom`.
		if (!sanitized) return;
		onChange({ mode: "custom", customPrefix: sanitized });
	};

	return (
		<div className="flex items-center gap-2">
			<Select
				value={selectValue}
				onValueChange={handleModeChange}
				disabled={disabled}
			>
				<SelectTrigger className={showDefault ? "w-[200px]" : "w-[180px]"}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{Object.entries(labels).map(([value, label]) => (
						<SelectItem key={value} value={value}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{selectValue === "custom" && (
				<Input
					placeholder="Prefix"
					value={customPrefixInput}
					onChange={(e) => setCustomPrefixInput(e.target.value)}
					onBlur={handleCustomPrefixBlur}
					className="w-[120px]"
					disabled={disabled}
				/>
			)}
		</div>
	);
}
