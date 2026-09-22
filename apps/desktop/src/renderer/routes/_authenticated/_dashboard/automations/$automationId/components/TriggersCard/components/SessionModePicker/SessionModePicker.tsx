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
 * previous run left behind.
 *
 * Only offered with a pinned workspace, which is where that session lives —
 * an automation that branches a workspace per run has nothing to continue,
 * and the API refuses the combination.
 */
export function SessionModePicker({
	continueAgentSession,
	pinnedWorkspaceId,
	disabled,
	onChange,
	className,
}: {
	continueAgentSession: boolean;
	pinnedWorkspaceId: string | null;
	disabled?: boolean;
	onChange: (continueAgentSession: boolean) => void;
	className?: string;
}) {
	const pinned = pinnedWorkspaceId !== null;
	const label = i18n._(
		continueAgentSession && pinned
			? msg({
					message: "continuing the last session",
				})
			: msg({
					message: "in a new session",
				}),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled || !pinned}>
				<span
					title={
						pinned
							? undefined
							: i18n._(
									msg({
										message:
											"Pin a workspace to continue its agent session between runs",
									}),
								)
					}
				>
					<ChipButton
						label={label}
						empty={!continueAgentSession}
						disabled={disabled || !pinned}
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
