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
import { cn } from "@superset/ui/utils";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCloud,
	HiOutlineComputerDesktop,
	HiOutlineExclamationTriangle,
	HiOutlineGlobeAlt,
	HiOutlineServer,
} from "react-icons/hi2";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import {
	useWorkspaceHostOptions,
	type WorkspaceHostDeviceOption,
	type WorkspaceHostSshOption,
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

function getSshStatusLabel(host: WorkspaceHostSshOption): string {
	if (!host.status) {
		return "Checking connection";
	}

	if (host.status.missingPrerequisites.length > 0) {
		return `Missing ${host.status.missingPrerequisites.join(", ")}`;
	}

	if (host.status.state === "ready") {
		return host.status.health?.hasModelProviderCredentials === false
			? "Connected, chat unavailable"
			: "Connected";
	}

	if (host.status.lastError) {
		return host.status.lastError;
	}

	switch (host.status.state) {
		case "checking":
			return "Checking host";
		case "syncing":
			return "Syncing bundle";
		case "installing":
			return "Installing dependencies";
		case "starting":
			return "Starting host-service";
		case "forwarding":
			return "Forwarding connection";
		default:
			return "Disconnected";
	}
}

function getSelectedLabel(
	hostTarget: WorkspaceHostTarget,
	currentDeviceName: string | null,
	otherDevices: WorkspaceHostDeviceOption[],
	sshHosts: WorkspaceHostSshOption[],
) {
	if (hostTarget.kind === "local") {
		return currentDeviceName ?? "Local Device";
	}

	if (hostTarget.kind === "cloud") {
		return "Cloud Workspace";
	}

	if (hostTarget.kind === "ssh") {
		return (
			sshHosts.find((host) => host.hostId === hostTarget.hostId)?.name ??
			"SSH Host"
		);
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

function getStatusDotClassName(host: WorkspaceHostSshOption) {
	if (!host.status) {
		return "bg-amber-500";
	}

	if (host.status.state === "ready") {
		return host.status.health?.hasModelProviderCredentials === false
			? "bg-amber-500"
			: "bg-emerald-500";
	}

	if (host.status.state === "error") {
		return "bg-red-500";
	}

	return "bg-amber-500";
}

export function DevicePicker({
	hostTarget,
	onSelectHostTarget,
}: DevicePickerProps) {
	const { currentDeviceName, otherDevices, sshHosts } =
		useWorkspaceHostOptions();
	const selectedLabel = getSelectedLabel(
		hostTarget,
		currentDeviceName,
		otherDevices,
		sshHosts,
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
			<DropdownMenuContent align="end" className="w-80">
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
						SSH Hosts
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-80">
						{sshHosts.length === 0 ? (
							<DropdownMenuItem disabled>
								No SSH hosts configured
							</DropdownMenuItem>
						) : (
							sshHosts.map((host) => {
								const isSelected =
									hostTarget.kind === "ssh" &&
									hostTarget.hostId === host.hostId;
								const statusLabel = getSshStatusLabel(host);

								return (
									<DropdownMenuItem
										key={host.hostId}
										onSelect={() =>
											onSelectHostTarget({
												kind: "ssh",
												hostId: host.hostId,
											})
										}
									>
										<HiOutlineServer className="size-4" />
										<div className="min-w-0 flex-1">
											<div className="truncate">{host.name}</div>
											<div className="truncate text-xs text-muted-foreground">
												{host.sshTarget}
											</div>
											<div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
												<span
													className={cn(
														"size-2 rounded-full",
														getStatusDotClassName(host),
													)}
												/>
												<span className="truncate">{statusLabel}</span>
											</div>
										</div>
										{host.status?.health?.hasModelProviderCredentials ===
											false && (
											<HiOutlineExclamationTriangle className="size-4 text-amber-500" />
										)}
										{isSelected && <HiCheck className="size-4" />}
									</DropdownMenuItem>
								);
							})
						)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
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
	);
}
