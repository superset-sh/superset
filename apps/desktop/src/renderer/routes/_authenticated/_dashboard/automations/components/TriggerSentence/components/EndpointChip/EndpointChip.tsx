import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuCopy } from "react-icons/lu";
import { CHIP, CHIP_EMPTY } from "../../chipStyles";

/**
 * The inbound URL a trigger listens on. Click copies it. Null until the row is
 * saved when the URL carries the trigger id.
 */
export function EndpointChip({
	url,
	method = "POST",
	placeholder = "Save to get URL",
}: {
	url: string | null;
	method?: string;
	placeholder?: string;
}) {
	if (!url) {
		return (
			<button
				type="button"
				disabled
				className={cn(CHIP, CHIP_EMPTY, "font-mono text-[12px]")}
			>
				{placeholder}
			</button>
		);
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() =>
						navigator.clipboard.writeText(url).then(
							() => toast.success("URL copied"),
							() => toast.error("Copy failed"),
						)
					}
					className={cn(CHIP, "max-w-80 font-mono text-[12px]")}
				>
					<span className="truncate">{url}</span>
					<LuCopy className="size-3 shrink-0 opacity-50" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="font-mono text-xs">
				{method} {url}
			</TooltipContent>
		</Tooltip>
	);
}
