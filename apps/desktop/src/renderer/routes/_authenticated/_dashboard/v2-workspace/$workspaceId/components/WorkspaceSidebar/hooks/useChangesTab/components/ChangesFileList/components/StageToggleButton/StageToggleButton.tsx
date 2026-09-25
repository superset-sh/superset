import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Minus, Plus } from "lucide-react";

interface StageToggleButtonProps {
	action: "stage" | "unstage";
	onClick: () => void;
}

export function StageToggleButton({ action, onClick }: StageToggleButtonProps) {
	const { t } = useLingui();
	const label =
		action === "stage"
			? t({ message: "Stage file" })
			: t({ message: "Unstage file" });
	const Icon = action === "stage" ? Plus : Minus;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
					onClick={(e) => {
						e.stopPropagation();
						onClick();
					}}
				>
					<Icon className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}
