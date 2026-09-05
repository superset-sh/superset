import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface DisabledReasonProps {
	disabled: boolean;
	reason: string;
	children: ReactNode;
}

/**
 * Explains a disabled control on hover. A disabled button swallows pointer
 * events, so the tooltip hangs off a wrapping span instead; when the control
 * is enabled the children render bare.
 */
export function DisabledReason({
	disabled,
	reason,
	children,
}: DisabledReasonProps) {
	if (!disabled) return children;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<span className="inline-flex">{children}</span>
			</TooltipTrigger>
			<TooltipContent side="top">{reason}</TooltipContent>
		</Tooltip>
	);
}
