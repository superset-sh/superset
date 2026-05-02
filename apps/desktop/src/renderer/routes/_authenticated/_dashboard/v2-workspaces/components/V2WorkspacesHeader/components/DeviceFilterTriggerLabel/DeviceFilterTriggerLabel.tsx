import { cn } from "@superset/ui/utils";
import { LuLaptop, LuLayers, LuMonitor } from "react-icons/lu";
import {
	DEVICE_FILTER_ALL,
	DEVICE_FILTER_THIS_DEVICE,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

interface DeviceFilterTriggerLabelProps {
	deviceFilter: string;
	selectedRemoteHost: { hostName: string; isOnline: boolean } | undefined;
}

export function DeviceFilterTriggerLabel({
	deviceFilter,
	selectedRemoteHost,
}: DeviceFilterTriggerLabelProps) {
	if (deviceFilter === DEVICE_FILTER_ALL) {
		return (
			<span className="flex items-center gap-2">
				<LuLayers className="size-3.5" />
				<span>All devices</span>
			</span>
		);
	}
	if (deviceFilter === DEVICE_FILTER_THIS_DEVICE) {
		return (
			<span className="flex items-center gap-2">
				<LuLaptop className="size-3.5" />
				<span>This device</span>
			</span>
		);
	}
	return (
		<span className="flex min-w-0 items-center gap-2">
			<LuMonitor className="size-3.5" />
			<span className="min-w-0 truncate">
				{selectedRemoteHost?.hostName ?? "Unknown device"}
			</span>
			{selectedRemoteHost ? (
				<span
					aria-hidden
					className={cn(
						"inline-block size-1.5 shrink-0 rounded-full",
						selectedRemoteHost.isOnline
							? "bg-emerald-500"
							: "bg-muted-foreground/40",
					)}
				/>
			) : null}
		</span>
	);
}
