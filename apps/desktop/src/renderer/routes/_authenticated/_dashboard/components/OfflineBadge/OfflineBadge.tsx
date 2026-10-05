import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlineWifi } from "react-icons/hi2";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";

export function OfflineBadge() {
	const { t } = useLingui();
	const isOnline = useOnlineStatus();
	if (isOnline) return null;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<output
					aria-label={t({ message: "Offline" })}
					className="flex size-7 items-center justify-center rounded-md text-muted-foreground"
				>
					<HiOutlineWifi className="size-4" />
				</output>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<Trans>Offline</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
