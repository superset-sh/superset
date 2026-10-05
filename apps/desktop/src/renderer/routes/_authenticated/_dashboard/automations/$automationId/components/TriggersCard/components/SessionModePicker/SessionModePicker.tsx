import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChipButton } from "../../../../../components/TriggerSentence/components/ChipButton";

/**
 * Whether each run starts its own agent session or continues the one the
 * previous run left behind. Only rendered for a pinned workspace, which is
 * where that session lives.
 */
export function SessionModePicker({
	continueAgentSession,
	disabled,
	onChange,
	className,
}: {
	continueAgentSession: boolean;
	disabled?: boolean;
	onChange: (continueAgentSession: boolean) => void;
	className?: string;
}) {
	const label = i18n._(
		continueAgentSession
			? msg({
					message: "continuing the last session",
				})
			: msg({
					message: "in a new session",
				}),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={label}
						empty={!continueAgentSession}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuRadioGroup
					value={continueAgentSession ? "continue" : "new"}
					onValueChange={(value) => onChange(value === "continue")}
				>
					<DropdownMenuRadioItem value="new">
						{i18n._(
							msg({
								message: "Start a new agent session each run",
							}),
						)}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="continue">
						{i18n._(
							msg({
								message: "Continue the session the last run left",
							}),
						)}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
