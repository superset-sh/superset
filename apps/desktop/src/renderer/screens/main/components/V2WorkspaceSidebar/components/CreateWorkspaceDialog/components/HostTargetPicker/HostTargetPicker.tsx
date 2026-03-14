import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/lib/utils";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCloud,
	HiOutlineComputerDesktop,
	HiOutlineGlobeAlt,
	HiOutlineServer,
} from "react-icons/hi2";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import type { WorkspaceHostDeviceOption } from "../../hooks/useWorkspaceHostOptions";

interface HostTargetPickerProps {
	currentDeviceName: string | null;
	hostTarget: WorkspaceHostTarget;
	onHostTargetChange: (target: WorkspaceHostTarget) => void;
	otherDevices: WorkspaceHostDeviceOption[];
}

function getDeviceIcon(type: WorkspaceHostDeviceOption["type"]) {
	switch (type) {
		case "cloud":
			return HiOutlineCloud;
		case "viewer":
			return HiOutlineGlobeAlt;
		default:
			return HiOutlineComputerDesktop;
	}
}

function getSelectedHostLabel(
	hostTarget: WorkspaceHostTarget,
	currentDeviceName: string | null,
	otherDevices: WorkspaceHostDeviceOption[],
): string {
	if (hostTarget.kind === "local") {
		return currentDeviceName ?? "Local Device";
	}

	if (hostTarget.kind === "cloud") {
		return "Cloud Workspace";
	}

	return (
		otherDevices.find((device) => device.id === hostTarget.deviceId)?.name ??
		"Unknown Device"
	);
}

function getSelectedHostDescription(
	hostTarget: WorkspaceHostTarget,
	otherDevices: WorkspaceHostDeviceOption[],
): string {
	if (hostTarget.kind === "local") {
		return "Create on this device's host service";
	}

	if (hostTarget.kind === "cloud") {
		return "Create through the cloud workspace host";
	}

	const selectedDevice = otherDevices.find(
		(device) => device.id === hostTarget.deviceId,
	);
	if (!selectedDevice) {
		return "Create on another device host";
	}

	return `${selectedDevice.isOnline ? "Online" : "Offline"} ${selectedDevice.type} host`;
}

function SelectedHostIcon({ hostTarget }: { hostTarget: WorkspaceHostTarget }) {
	if (hostTarget.kind === "local") {
		return <HiOutlineComputerDesktop className="size-4 shrink-0" />;
	}

	if (hostTarget.kind === "cloud") {
		return <HiOutlineCloud className="size-4 shrink-0" />;
	}

	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function HostTargetPicker({
	currentDeviceName,
	hostTarget,
	onHostTargetChange,
	otherDevices,
}: HostTargetPickerProps) {
	const selectedHostLabel = getSelectedHostLabel(
		hostTarget,
		currentDeviceName,
		otherDevices,
	);
	const selectedHostDescription = getSelectedHostDescription(
		hostTarget,
		otherDevices,
	);

	return (
		<div className="space-y-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-between"
					>
						<span className="flex min-w-0 items-center gap-2">
							<SelectedHostIcon hostTarget={hostTarget} />
							<span className="truncate">{selectedHostLabel}</span>
						</span>
						<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-72">
					<DropdownMenuItem
						onSelect={() => onHostTargetChange({ kind: "local" })}
					>
						<HiOutlineComputerDesktop className="size-4" />
						<span className="flex-1">Local Device</span>
						{hostTarget.kind === "local" && <HiCheck className="size-4" />}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => onHostTargetChange({ kind: "cloud" })}
					>
						<HiOutlineCloud className="size-4" />
						<span className="flex-1">Cloud Workspace</span>
						{hostTarget.kind === "cloud" && <HiCheck className="size-4" />}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<HiOutlineServer className="size-4" />
							Other Devices
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-72">
							{otherDevices.length === 0 ? (
								<DropdownMenuItem disabled>No devices found</DropdownMenuItem>
							) : (
								otherDevices.map((device) => {
									const DeviceIcon = getDeviceIcon(device.type);
									const isSelected =
										hostTarget.kind === "device" &&
										hostTarget.deviceId === device.id;

									return (
										<DropdownMenuItem
											key={device.id}
											onSelect={() =>
												onHostTargetChange({
													kind: "device",
													deviceId: device.id,
												})
											}
										>
											<DeviceIcon className="size-4" />
											<div className="min-w-0 flex-1">
												<div className="truncate">{device.name}</div>
												<div className="text-xs text-muted-foreground">
													{device.type}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<span
													className={cn(
														"size-2 rounded-full",
														device.isOnline
															? "bg-emerald-500"
															: "bg-muted-foreground/40",
													)}
												/>
												<span className="text-xs text-muted-foreground">
													{device.isOnline ? "Online" : "Offline"}
												</span>
												{isSelected && <HiCheck className="size-4" />}
											</div>
										</DropdownMenuItem>
									);
								})
							)}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>
			<p className="text-xs text-muted-foreground">{selectedHostDescription}</p>
		</div>
	);
}
