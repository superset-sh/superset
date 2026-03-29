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
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCloud,
	HiOutlineComputerDesktop,
	HiOutlineGlobeAlt,
	HiOutlineServer,
} from "react-icons/hi2";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import {
	useWorkspaceHostOptions,
	type WorkspaceHostDeviceOption,
} from "./hooks/useWorkspaceHostOptions";

interface DevicePickerProps {
	hostTarget: WorkspaceHostTarget;
	onSelectHostTarget: (target: WorkspaceHostTarget) => void;
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

function getSelectedLabel(
	hostTarget: WorkspaceHostTarget,
	currentDeviceName: string | null,
	otherDevices: WorkspaceHostDeviceOption[],
) {
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

function getSelectedIcon(hostTarget: WorkspaceHostTarget) {
	if (hostTarget.kind === "local") {
		return <HiOutlineComputerDesktop className="size-4 shrink-0" />;
	}

	if (hostTarget.kind === "cloud") {
		return <HiOutlineCloud className="size-4 shrink-0" />;
	}

	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function DevicePicker({
	hostTarget,
	onSelectHostTarget,
}: DevicePickerProps) {
	const { currentDeviceName, otherDevices } = useWorkspaceHostOptions();
	const selectedLabel = getSelectedLabel(
		hostTarget,
		currentDeviceName,
		otherDevices,
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
					<span className="flex min-w-0 items-center gap-1.5">
						{getSelectedIcon(hostTarget)}
						<span className="max-w-[140px] truncate">{selectedLabel}</span>
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuItem
					onSelect={() => onSelectHostTarget({ kind: "local" })}
				>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">Local Device</span>
					{hostTarget.kind === "local" && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => onSelectHostTarget({ kind: "cloud" })}
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
											onSelectHostTarget({
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
										{isSelected && <HiCheck className="size-4" />}
									</DropdownMenuItem>
								);
							})
						)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
