import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Loader2 } from "lucide-react";

interface FilesTabHeaderButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	loading?: boolean;
	onClick: () => void;
}

/** Icon-only action button in the Files-tab "Explorer" header (New File/Folder, Refresh, Collapse All). */
export function FilesTabHeaderButton({
	icon: Icon,
	label,
	loading,
	onClick,
}: FilesTabHeaderButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-5"
					onClick={onClick}
					aria-label={label}
				>
					{loading ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<Icon className="size-3" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
