import { Trans } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { LuCheck, LuLock, LuUnplug } from "react-icons/lu";
import { useConnector } from "../../hooks/useConnector";

interface ConnectorRowProps {
	slug: string;
	description?: string | null;
	icon?: ReactNode;
	organizationId?: string | null;
	canConnect?: boolean;
	onConnect: () => void;
}

export function ConnectorRow({
	slug,
	description,
	icon,
	organizationId,
	canConnect = true,
	onConnect,
}: ConnectorRowProps) {
	const { connector, connection, isPending, disconnect } = useConnector(
		slug,
		organizationId,
	);

	if (isPending || !connector) return null;

	const who = connection?.externalUserLabel;
	const where = connection?.externalAccountLabel;
	const account = who && where ? `${who} · ${where}` : (who ?? where ?? "");

	return (
		<div className="flex items-center gap-3 py-3.5">
			{icon}
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium text-foreground">
					{connector.displayName}
				</div>
				<p className="truncate text-xs text-muted-foreground">
					{connection ? account : description}
				</p>
			</div>
			{connection ? (
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant="secondary" className="gap-1">
						<LuCheck className="size-3" />
						<Trans>Connected</Trans>
					</Badge>
					<Button
						variant="ghost"
						size="sm"
						disabled={disconnect.isPending}
						onClick={() => disconnect.mutate({ connectionId: connection.id })}
					>
						<LuUnplug className="mr-1.5 size-3.5" />
						<Trans>Disconnect</Trans>
					</Button>
				</div>
			) : canConnect ? (
				<Button
					variant="outline"
					size="sm"
					className="shrink-0"
					onClick={onConnect}
				>
					<Trans>Connect</Trans>
				</Button>
			) : (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<LuLock className="size-4 shrink-0 text-muted-foreground" />
					</TooltipTrigger>
					<TooltipContent>
						<Trans>Install the plugin to connect</Trans>
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
