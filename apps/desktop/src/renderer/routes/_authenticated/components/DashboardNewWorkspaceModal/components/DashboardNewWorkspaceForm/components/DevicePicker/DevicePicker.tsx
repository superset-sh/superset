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
	HiOutlineServer,
} from "react-icons/hi2";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import {
	useWorkspaceHostOptions,
	type WorkspaceHostOption,
} from "./hooks/useWorkspaceHostOptions";

interface DevicePickerProps {
	hostTarget: WorkspaceHostTarget;
	onSelectHostTarget: (target: WorkspaceHostTarget) => void;
}

function getHostIcon(host: WorkspaceHostOption) {
	return host.isCloud ? HiOutlineCloud : HiOutlineComputerDesktop;
}

function getSelectedLabel(
	hostTarget: WorkspaceHostTarget,
	currentDeviceName: string | null,
	otherHosts: WorkspaceHostOption[],
) {
	if (hostTarget.kind === "local") {
		return currentDeviceName ?? "Local Device";
	}

	if (hostTarget.kind === "cloud") {
		return "Cloud Workspace";
	}

	return (
		otherHosts.find((host) => host.id === hostTarget.hostId)?.name ??
		"Unknown Host"
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
	const { currentDeviceName, otherHosts } = useWorkspaceHostOptions();
	const selectedLabel = getSelectedLabel(
		hostTarget,
		currentDeviceName,
		otherHosts,
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
						Other Hosts
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-72">
						{otherHosts.length === 0 ? (
							<DropdownMenuItem disabled>No hosts found</DropdownMenuItem>
						) : (
							otherHosts.map((host) => {
								const HostIcon = getHostIcon(host);
								const isSelected =
									hostTarget.kind === "host" && hostTarget.hostId === host.id;

								return (
									<DropdownMenuItem
										key={host.id}
										onSelect={() =>
											onSelectHostTarget({
												kind: "host",
												hostId: host.id,
											})
										}
									>
										<HostIcon className="size-4" />
										<div className="min-w-0 flex-1">
											<div className="truncate">{host.name}</div>
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
