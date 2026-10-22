import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuBuilding2 } from "react-icons/lu";

interface ManagedBadgeProps {
	compact?: boolean;
}

export function ManagedBadge({ compact = false }: ManagedBadgeProps) {
	const { t } = useLingui();
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<Badge
					variant="secondary"
					aria-label={
						compact
							? t({ message: "Installed by your organization" })
							: undefined
					}
					className="h-4 shrink-0 gap-0.5 rounded px-1 text-[9px] font-medium tracking-wide uppercase"
				>
					<LuBuilding2 className="size-2.5" />
					{!compact && <Trans>Installed by your organization</Trans>}
				</Badge>
			</TooltipTrigger>
			<TooltipContent>
				<Trans>
					Your organization installs this plugin for you. You can disable it,
					but not remove it.
				</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
