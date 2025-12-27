import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuCloud } from "react-icons/lu";

const BUTTON_HEIGHT = 24;

export function ConvertToCloudButton() {
	const handleConvertToCloud = () => {
		// TODO: Implement convert to cloud functionality
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleConvertToCloud}
					style={{ height: `${BUTTON_HEIGHT}px` }}
					className="flex items-center gap-1.5 px-2.5 rounded border border-foreground/20 bg-foreground/5 hover:bg-foreground/10 text-[11px] font-semibold text-foreground transition-colors"
				>
					<LuCloud className="size-3.5" />
					<span>Convert to cloud</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={8}>
				Convert workspace to cloud
			</TooltipContent>
		</Tooltip>
	);
}
