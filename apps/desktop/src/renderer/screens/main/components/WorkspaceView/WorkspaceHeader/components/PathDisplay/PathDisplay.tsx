import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlineFolder } from "react-icons/hi2";

interface PathDisplayProps {
	path: string;
}

export function PathDisplay({ path }: PathDisplayProps) {
	// Replace home directory with ~ for display
	const displayPath = path.replace(/^\/Users\/[^/]+/, "~");

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
					<HiOutlineFolder className="w-3.5 h-3.5 shrink-0" />
					<span className="truncate">{displayPath}</span>
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{displayPath}
			</TooltipContent>
		</Tooltip>
	);
}
