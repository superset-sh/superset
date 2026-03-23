import { cn } from "@superset/ui/utils";
import { LuCircleCheck, LuCircleDot } from "react-icons/lu";

export type IssueState = "open" | "closed";

interface IssueIconProps {
	state: IssueState;
	className?: string;
}

const stateStyles: Record<IssueState, string> = {
	open: "text-emerald-500",
	closed: "text-violet-500",
};

/**
 * Renders an issue icon with color based on state.
 * - open: green dot icon
 * - closed: purple/violet check icon
 */
export function IssueIcon({ state, className }: IssueIconProps) {
	const baseClass = cn(stateStyles[state], className);

	if (state === "closed") {
		return <LuCircleCheck className={baseClass} />;
	}

	// open
	return <LuCircleDot className={baseClass} />;
}
