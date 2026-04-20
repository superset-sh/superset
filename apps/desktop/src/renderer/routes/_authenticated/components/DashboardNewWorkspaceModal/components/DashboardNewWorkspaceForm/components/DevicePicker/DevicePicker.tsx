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
	HiOutlineComputerDesktop,
	HiOutlineServer,
} from "react-icons/hi2";
import { FormPickerTrigger } from "../../PromptGroup/components/FormPickerTrigger";
import {
	useWorkspaceHostOptions,
	type WorkspaceHostOption,
} from "./hooks/useWorkspaceHostOptions";
import type { WorkspaceHostTarget } from "./types";

function OnlineDot({ online }: { online: boolean }) {
	return (
		<span
			role="img"
			aria-label={online ? "online" : "offline"}
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				online ? "bg-emerald-500" : "bg-muted-foreground/60",
			)}
		/>
	);
}

interface DevicePickerProps {
	hostTarget: WorkspaceHostTarget;
	onSelectHostTarget: (target: WorkspaceHostTarget) => void;
	className?: string;
}

function getSelectedLabel(
	hostTarget: WorkspaceHostTarget,
	currentDeviceName: string | null,
	otherHosts: WorkspaceHostOption[],
) {
	if (hostTarget.kind === "local") {
		return currentDeviceName ?? "Local Device";
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

	return <HiOutlineServer className="size-4 shrink-0" />;
}

export function DevicePicker({
	hostTarget,
	onSelectHostTarget,
	className,
}: DevicePickerProps) {
	const { currentDeviceName, otherHosts } = useWorkspaceHostOptions();
	const selectedLabel = getSelectedLabel(
		hostTarget,
		currentDeviceName,
		otherHosts,
	);
	// Only remote hosts have a meaningful online indicator — the app itself
	// is the local host, so it's tautologically online.
	const selectedRemoteOnline =
		hostTarget.kind === "host"
			? (otherHosts.find((host) => host.id === hostTarget.hostId)?.isOnline ??
				false)
			: null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FormPickerTrigger
					className={cn("max-w-[140px]", className)}
					aria-label={`Device: ${selectedLabel}`}
					title={selectedLabel}
				>
					{getSelectedIcon(hostTarget)}
					<span className="truncate">{selectedLabel}</span>
					{selectedRemoteOnline !== null && (
						<OnlineDot online={selectedRemoteOnline} />
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuItem
					onSelect={() => onSelectHostTarget({ kind: "local" })}
				>
					<HiOutlineComputerDesktop className="size-4" />
					<span className="flex-1">Local Device</span>
					{hostTarget.kind === "local" && <HiCheck className="size-4" />}
				</DropdownMenuItem>
				{otherHosts.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<HiOutlineServer className="size-4" />
								Other Hosts
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-72">
								{otherHosts.map((host) => {
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
											<HiOutlineServer className="size-4" />
											<span className="min-w-0 truncate">{host.name}</span>
											<OnlineDot online={host.isOnline} />
											{isSelected && (
												<HiCheck className="ml-auto size-4 shrink-0" />
											)}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
