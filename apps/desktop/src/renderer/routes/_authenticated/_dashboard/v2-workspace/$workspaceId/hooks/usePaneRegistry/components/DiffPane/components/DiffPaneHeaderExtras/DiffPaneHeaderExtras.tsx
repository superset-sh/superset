import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { SquareSplitHorizontal } from "lucide-react";
import { TbScan } from "react-icons/tb";
import { useSettings } from "renderer/stores/settings";

export function DiffPaneHeaderExtras() {
	const diffStyle = useSettings((s) => s.diffStyle);
	const updateSetting = useSettings((s) => s.update);

	const buttonClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex items-center">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "unified")}
						aria-label="Unified view"
						aria-pressed={diffStyle === "unified"}
						className={buttonClass(diffStyle === "unified")}
					>
						<TbScan className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Unified view
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "split")}
						aria-label="Split view"
						aria-pressed={diffStyle === "split"}
						className={buttonClass(diffStyle === "split")}
					>
						<SquareSplitHorizontal className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Split view
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
		</div>
	);
}
