import type { DeviceClient } from "@expo/hub-client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { LuX } from "react-icons/lu";
import { ActivitySection } from "./components/ActivitySection";
import { AppSection } from "./components/AppSection";
import { EventLogSection } from "./components/EventLogSection";
import { SimulatorSection } from "./components/SimulatorSection";

interface ToolsPanelProps {
	client: DeviceClient;
	onClose: () => void;
}

export function ToolsPanel({ client, onClose }: ToolsPanelProps) {
	const { t } = useLingui();

	return (
		<aside className="absolute top-3 right-3 bottom-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
			<header className="flex h-9 shrink-0 items-center justify-between pr-1 pl-3">
				<span className="text-xs font-medium">
					<Trans>Tools</Trans>
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
				>
					<LuX className="size-3.5" />
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
				{client.foregroundApp ? (
					<AppSection app={client.foregroundApp} platform={client.platform} />
				) : (
					<div className="flex items-center gap-2.5 px-3 py-2.5">
						<Skeleton className="size-8 rounded-md" />
						<div className="flex flex-1 flex-col gap-1.5">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-2.5 w-36" />
						</div>
					</div>
				)}
				{client.capabilities.activity && (
					<ActivitySection activity={client.activity} />
				)}
				{client.capabilities.events && <EventLogSection client={client} />}
				<SimulatorSection client={client} />
			</div>
		</aside>
	);
}
