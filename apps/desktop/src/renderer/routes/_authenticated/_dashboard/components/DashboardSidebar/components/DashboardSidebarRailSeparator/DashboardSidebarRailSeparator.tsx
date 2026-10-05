import { useLingui } from "@lingui/react/macro";
import { Separator } from "@superset/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";

interface DashboardSidebarRailSeparatorProps {
	collection?: { name: string; color: string | null };
}

export function DashboardSidebarRailSeparator({
	collection,
}: DashboardSidebarRailSeparatorProps) {
	const { t } = useLingui();
	if (!collection)
		return (
			<div className="px-3 py-1.5">
				<Separator
					decorative={false}
					aria-label={t({ message: "Projects outside collections" })}
				/>
			</div>
		);
	const name = collection.name;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<div className="relative -mt-1 -mb-2 px-3 pt-2.5 pb-3.5">
					<Separator
						decorative={false}
						aria-label={t({ message: `Collection: ${name}` })}
						className={cn(
							"data-[orientation=horizontal]:h-0.5 rounded-full",
							!collection.color && "bg-muted-foreground",
						)}
						style={
							collection.color
								? { backgroundColor: collection.color }
								: undefined
						}
					/>
				</div>
			</TooltipTrigger>
			<TooltipContent side="right">{name}</TooltipContent>
		</Tooltip>
	);
}
